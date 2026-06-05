/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDb, mockTrx } = vi.hoisted(() => {
  function makeMock() {
    const m = vi.fn() as any;
    m.mockReturnValue(m); // m('table') returns m, enabling chain collapse
    m.where = vi.fn().mockReturnValue(m);
    m.whereIn = vi.fn().mockReturnValue(m);
    m.select = vi.fn().mockReturnValue(m);
    m.insert = vi.fn().mockReturnValue(m);
    m.returning = vi.fn().mockResolvedValue([]);
    m.first = vi.fn().mockResolvedValue(undefined);
    m.groupBy = vi.fn().mockReturnValue(m);
    m.update = vi.fn().mockResolvedValue(1);
    m.forUpdate = vi.fn().mockReturnValue(m);
    m.raw = vi.fn().mockReturnValue(m);
    m.join = vi.fn().mockReturnValue(m);
    m.distinct = vi.fn().mockReturnValue(m);
    m.orderBy = vi.fn().mockReturnValue(m);
    m.limit = vi.fn().mockReturnValue(m);
    m.offset = vi.fn().mockReturnValue(m);
    // Makes plain SELECT queries awaitable: await db('t').where({}) resolves via .then()
    m.then = vi.fn((resolve: (v: unknown) => void, reject: (r: unknown) => void) =>
      Promise.resolve([]).then(resolve, reject),
    );
    return m;
  }

  const mockTrx = makeMock();
  const mockDb = makeMock();
  mockDb.transaction = vi.fn((fn: (trx: typeof mockTrx) => Promise<unknown>) => fn(mockTrx));

  return { mockDb, mockTrx };
});

vi.mock('../../src/database/client.js', () => ({ db: mockDb }));

import { getTransferById, createTransfer, listTransfers, voidTransfer } from '../../src/services/transfers/index.js';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  InsufficientFundsError,
} from '../../src/lib/errors.js';

const senderAccountId = '05921e0c-2c85-4f7d-9367-af274863c012';
const receiverAccountId = 'b4fd86f7-6e13-4b21-bf4f-cefe8c2da9a9';
const revenueAccountId = '0cadac5c-7761-4372-985e-59bc43fa1571';

const mockTransfer = {
  id: 'transfer-uuid-001',
  idempotency_key: '550e8400-e29b-41d4-a716-446655440001',
  description: 'Transfer',
  status: 'POSTED',
  metadata: null,
  posted_at: new Date(),
  voided_at: null,
  created_at: new Date(),
  updated_at: new Date(),
};

const mockEntries = [
  {
    id: 'entry-uuid-001',
    transfer_id: 'transfer-uuid-001',
    account_id: senderAccountId,
    direction: 'CREDIT',
    amount: '100.000000000000000000',
    currency: 'USD',
    created_at: new Date(),
  },
  {
    id: 'entry-uuid-002',
    transfer_id: 'transfer-uuid-001',
    account_id: receiverAccountId,
    direction: 'DEBIT',
    amount: '100.000000000000000000',
    currency: 'USD',
    created_at: new Date(),
  },
];

describe('listTransfers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ValidationError when account_id is omitted', async () => {
    await expect(listTransfers({})).rejects.toThrow(ValidationError);
  });

  it('returns empty array when no transfers exist for the account', async () => {
    mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]));

    const result = await listTransfers({ account_id: senderAccountId });

    expect(result).toEqual([]);
  });

  it('returns transfers with their entries when found', async () => {
    mockDb.then
      .mockImplementationOnce((resolve: (v: unknown) => void) => resolve([mockTransfer]))
      .mockImplementationOnce((resolve: (v: unknown) => void) => resolve(mockEntries));

    const result = await listTransfers({ account_id: senderAccountId });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(mockTransfer.id);
    expect(result[0].entries).toHaveLength(2);
  });

  it('applies the provided limit and offset', async () => {
    mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve([]));

    await listTransfers({ account_id: senderAccountId, limit: 5, offset: 10 });

    expect(mockDb.limit).toHaveBeenCalledWith(5);
    expect(mockDb.offset).toHaveBeenCalledWith(10);
  });
});

describe('getTransferById', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns transfer with entries when found', async () => {
    mockDb.first.mockResolvedValueOnce(mockTransfer);
    mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve(mockEntries));

    const result = await getTransferById('transfer-uuid-001');

    expect(result.id).toBe('transfer-uuid-001');
    expect(result.entries).toHaveLength(2);
  });

  it('throws NotFoundError when transfer does not exist', async () => {
    mockDb.first.mockResolvedValueOnce(undefined);

    await expect(
      getTransferById('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('createTransfer — validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ValidationError when entries are unbalanced', async () => {
    await expect(
      createTransfer({
        idempotency_key: '550e8400-e29b-41d4-a716-446655440001',
        description: 'Unbalanced',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '100.00', currency: 'USD' },
          { account_id: receiverAccountId, direction: 'CREDIT', amount: '50.00', currency: 'USD' },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when entries use mixed currencies', async () => {
    await expect(
      createTransfer({
        idempotency_key: '550e8400-e29b-41d4-a716-446655440001',
        description: 'Mixed currencies',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '100.00', currency: 'USD' },
          { account_id: receiverAccountId, direction: 'CREDIT', amount: '100.00', currency: 'ETH' },
        ],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when an account does not exist', async () => {
    mockTrx.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve([{ id: senderAccountId }]));

    await expect(
      createTransfer({
        idempotency_key: '550e8400-e29b-41d4-a716-446655440001',
        description: 'Missing account',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '100.00', currency: 'USD' },
          { account_id: receiverAccountId, direction: 'CREDIT', amount: '100.00', currency: 'USD' },
        ],
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws InsufficientFundsError when ASSET account has insufficient balance', async () => {
    mockTrx.then
      .mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ id: senderAccountId }, { id: receiverAccountId }]),
      )
      .mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ id: senderAccountId, type: 'ASSET' }]),
      )
      .mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([
          {
            account_id: senderAccountId,
            total_debits: '100.000000000000000000',
            total_credits: '0',
          },
        ]),
      );

    await expect(
      createTransfer({
        idempotency_key: '550e8400-e29b-41d4-a716-446655440001',
        description: 'Overdraft attempt',
        entries: [
          { account_id: senderAccountId, direction: 'CREDIT', amount: '999.00', currency: 'USD' },
          { account_id: receiverAccountId, direction: 'DEBIT', amount: '999.00', currency: 'USD' },
        ],
      }),
    ).rejects.toThrow(InsufficientFundsError);
  });

  it('does NOT throw InsufficientFundsError for REVENUE account with zero balance', async () => {
    mockTrx.then
      .mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ id: senderAccountId }, { id: revenueAccountId }]),
      )
      .mockImplementationOnce((resolve: (v: unknown) => void) =>
        resolve([{ id: revenueAccountId, type: 'REVENUE' }]),
      );

    mockTrx.returning
      .mockResolvedValueOnce([mockTransfer])
      .mockResolvedValueOnce(mockEntries);

    await expect(
      createTransfer({
        idempotency_key: '550e8400-e29b-41d4-a716-446655440001',
        description: 'Deposit to revenue account',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '1000.00', currency: 'USD' },
          { account_id: revenueAccountId, direction: 'CREDIT', amount: '1000.00', currency: 'USD' },
        ],
      }),
    ).resolves.toBeDefined();
  });
});

describe('voidTransfer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundError when transfer does not exist', async () => {
    mockDb.first.mockResolvedValueOnce(undefined);

    await expect(
      voidTransfer('00000000-0000-0000-0000-000000000000', 'mistake'),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ConflictError when transfer is already voided', async () => {
    mockDb.first.mockResolvedValueOnce({ ...mockTransfer, status: 'VOIDED' });
    mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve(mockEntries));

    await expect(
      voidTransfer('transfer-uuid-001', 'mistake'),
    ).rejects.toThrow(ConflictError);
  });

  it('throws ConflictError when transfer is still pending', async () => {
    mockDb.first.mockResolvedValueOnce({ ...mockTransfer, status: 'PENDING' });
    mockDb.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve(mockEntries));

    await expect(
      voidTransfer('transfer-uuid-001', 'mistake'),
    ).rejects.toThrow(ConflictError);
  });
});
