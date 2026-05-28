import { Decimal } from 'decimal.js';
import { Knex } from 'knex';
import { db } from '../../database/client.js';
import { CreateEntryInput, Entry } from '../../database/models/entriesModel.js';
import {
  CreateTransferInput,
  Transfer,
  TransferWithEntries,
} from '../../database/models/transferModel.js';
import {
  ConflictError,
  InsufficientFundsError,
  NotFoundError,
  ValidationError,
} from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export async function getTransferById(id: string): Promise<TransferWithEntries> {
  try {
    const transfer: Transfer = await db('transfers').where({ id }).first();

    if (!transfer) {
      throw new NotFoundError('Transfer', id);
    }

    const entries: Entry[] = await db('entries').where({ transfer_id: id });

    return { ...transfer, entries };
  } catch (error) {
    logger.error(
      `Error fetching transfer: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

export async function createTransfer(input: CreateTransferInput): Promise<TransferWithEntries> {
  try {
    if (input.entries.length === 0) {
      throw new ValidationError('Transfer must have at least one entry');
    }

    // Sum of debits must equal sum of credits
    validateEntriesBalance(input.entries);
    validateCurrencies(input.entries);

    const result = await db.transaction(async (transaction) => {
      // Return early if this idempotency key was already processed
      const existing: Transfer | undefined = await transaction('transfers')
        .where({ idempotency_key: input.idempotency_key })
        .first();
      if (existing) {
        const existingEntries: Entry[] = await transaction('entries').where({
          transfer_id: existing.id,
        });
        return { ...existing, entries: existingEntries };
      }

      // Lock account rows and validate existence + sufficient funds inside the
      // transaction to prevent time-of-check/time-of-use races with concurrent transfers
      await validateAccountsExist(
        transaction,
        input.entries.map((e) => e.account_id),
      );
      await validateSufficientFunds(transaction, input.entries);

      const [transfer]: Transfer[] = await transaction('transfers')
        .insert({
          idempotency_key: input.idempotency_key,
          description: input.description,
          status: 'POSTED',
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
          posted_at: new Date(),
        })
        .returning('*');

      if (!transfer) {
        throw new Error('Failed to create transfer');
      }

      const entries: Entry[] = await transaction('entries')
        .insert(
          input.entries.map((entry) => ({
            transfer_id: transfer.id,
            account_id: entry.account_id,
            direction: entry.direction,
            amount: entry.amount,
            currency: entry.currency,
          })),
        )
        .returning('*');

      return { ...transfer, entries };
    });

    return result;
  } catch (error) {
    logger.error(
      `Error creating transfer: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

// Voiding a transfer marks the original as VOIDED and creates a new reversing
// transfer with flipped entries. Financial entry records are never deleted.
export async function voidTransfer(id: string, reason: string): Promise<TransferWithEntries> {
  try {
    const original = await getTransferById(id);

    if (original.status === 'VOIDED') {
      throw new ConflictError(`Transfer '${id}' is already voided`);
    }

    if (original.status === 'PENDING') {
      throw new ConflictError(`Transfer '${id}' is still pending and cannot be voided`);
    }

    // Build the reversal entry inputs upfront so they can be validated and reused
    const reversalEntries: CreateEntryInput[] = original.entries.map((entry) => ({
      account_id: entry.account_id,
      direction: entry.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
      amount: entry.amount,
      currency: entry.currency,
    }));

    const result = await db.transaction(async (transaction) => {
      // Lock accounts and verify the reversal won't overdraft any account
      await validateAccountsExist(
        transaction,
        original.entries.map((e) => e.account_id),
      );
      await validateSufficientFunds(transaction, reversalEntries);

      await transaction('transfers').where({ id }).update({
        status: 'VOIDED',
        voided_at: new Date(),
      });

      const [reversal]: Transfer[] = await transaction('transfers')
        .insert({
          idempotency_key: crypto.randomUUID(),
          description: `Void of transfer ${id}: ${reason}`,
          status: 'POSTED',
          metadata: JSON.stringify({ voided_transfer_id: id, reason }),
          posted_at: new Date(),
        })
        .returning('*');

      if (!reversal) {
        throw new Error('Failed to create reversal transfer');
      }

      const entries: Entry[] = await transaction('entries')
        .insert(
          reversalEntries.map((entry) => ({
            transfer_id: reversal.id,
            account_id: entry.account_id,
            direction: entry.direction,
            amount: entry.amount,
            currency: entry.currency,
          })),
        )
        .returning('*');

      return { ...reversal, entries };
    });

    return result;
  } catch (error) {
    logger.error(
      `Error voiding transfer: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

function validateEntriesBalance(entries: CreateTransferInput['entries']): void {
  const debits = entries
    .filter((e) => e.direction === 'DEBIT')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

  const credits = entries
    .filter((e) => e.direction === 'CREDIT')
    .reduce((sum, e) => sum.plus(e.amount), new Decimal(0));

  if (!debits.equals(credits)) {
    throw new ValidationError(
      `Transfer entries are unbalanced: debits=${debits.toFixed(18)} credits=${credits.toFixed(18)}`,
    );
  }
}

function validateCurrencies(entries: CreateTransferInput['entries']): void {
  const currencies = new Set(entries.map((e) => e.currency));
  if (currencies.size > 1) {
    throw new ValidationError(
      `All entries must use the same currency. Found: ${[...currencies].join(', ')}`,
    );
  }
}

async function validateAccountsExist(
  transaction: Knex.Transaction,
  accountIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(accountIds)];
  const found: { id: string }[] = await transaction('accounts')
    .whereIn('id', uniqueIds)
    .select('id')
    .forUpdate();
  const foundIds = new Set(found.map((a: { id: string }) => a.id));

  const missing = uniqueIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    throw new NotFoundError('Account', missing.join(', '));
  }
}

async function validateSufficientFunds(
  transaction: Knex.Transaction,
  entries: CreateEntryInput[],
): Promise<void> {
  const creditEntries = entries.filter((e) => e.direction === 'CREDIT');
  if (creditEntries.length === 0) return;

  const creditAccountIds = [...new Set(creditEntries.map((e) => e.account_id))];

  const accounts = await transaction('accounts')
    .whereIn('id', creditAccountIds)
    .select('id', 'type');

  const assetAccountIds = new Set(
    accounts
      .filter((a: { id: string; type: string }) => a.type === 'ASSET')
      .map((a: { id: string; type: string }) => a.id),
  );

  if (assetAccountIds.size === 0) return;

  const assetCreditEntries = creditEntries.filter((e) => assetAccountIds.has(e.account_id));

  const balanceRows = await transaction('entries')
    .whereIn('account_id', [...assetAccountIds])
    .select('account_id')
    .select(
      transaction.raw(
        `COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits`,
      ),
      transaction.raw(
        `COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits`,
      ),
    )
    .groupBy('account_id');

  const balanceMap = new Map<string, Decimal>();
  for (const row of balanceRows) {
    const debits = new Decimal(row.total_debits.toString());
    const credits = new Decimal(row.total_credits.toString());
    balanceMap.set(row.account_id, debits.minus(credits));
  }

  // Accumulate total credits per account to catch multi-entry overdrafts
  const pendingCredits = new Map<string, Decimal>();
  for (const entry of assetCreditEntries) {
    const current = pendingCredits.get(entry.account_id) ?? new Decimal(0);
    pendingCredits.set(entry.account_id, current.plus(entry.amount));
  }

  for (const [accountId, totalCredit] of pendingCredits) {
    const balance = balanceMap.get(accountId) ?? new Decimal(0);
    if (balance.lessThan(totalCredit)) {
      throw new InsufficientFundsError(accountId);
    }
  }
}
