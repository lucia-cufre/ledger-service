import { Decimal } from 'decimal.js';
import {
  Account,
  AccountWithBalance,
  CreateAccountData,
} from '../../database/models/accountModel.js';
import { db } from '../../database/client.js';
import { NotFoundError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export async function createAccount(data: CreateAccountData): Promise<Account> {
  try {
    const [account] = await db('accounts')
      .insert({
        name: data.name,
        type: data.type,
        currency: data.currency,
        description: data.description ?? null,
        is_system: data.is_system ?? false,
      })
      .returning('*');

    return account as Account;
  } catch (error) {
    logger.error(
      `Error creating account: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

export async function getAccountById(id: string): Promise<AccountWithBalance> {
  try {
    const account: Account | undefined = await db('accounts').where({ id }).first();

    if (!account) {
      throw new NotFoundError('Account', id);
    }

    const balance = await computeBalance(id);

    return { ...account, balance };
  } catch (error) {
    logger.error(
      `Error fetching account: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

export async function listAccounts(): Promise<AccountWithBalance[]> {
  try {
    const accounts: Account[] = await db('accounts').orderBy('created_at', 'asc');

    const accountsWithBalances = await Promise.all(
      accounts.map(async (account) => {
        const balance = await computeBalance(account.id);
        return { ...account, balance };
      }),
    );

    return accountsWithBalances;
  } catch (error) {
    logger.error(
      `Error listing accounts: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}

// Balance is NEVER stored — always computed from entries.
// Debits increase the balance, credits decrease it.
export async function computeBalance(accountId: string): Promise<string> {
  try {
    const result = await db('entries')
      .where({ account_id: accountId })
      .select(
        db.raw(
          `COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits`,
        ),
        db.raw(
          `COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits`,
        ),
      )
      .first();

    const debits = new Decimal(result?.total_debits?.toString() ?? '0');
    const credits = new Decimal(result?.total_credits?.toString() ?? '0');

    return debits.minus(credits).toFixed(18);
  } catch (error) {
    logger.error(
      `Error computing balance: ${error instanceof Error ? error.message : String(error)}`,
    );
    throw error;
  }
}
