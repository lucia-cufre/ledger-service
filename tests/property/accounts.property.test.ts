import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { Decimal } from 'decimal.js';
import { createAccount, computeBalance } from '../../src/services/accounts/index.js';

const { mockBuilder, mockDb } = vi.hoisted(() => {
  const mockBuilder = {
    insert: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    first: vi.fn(),
  };
  const mockDb = Object.assign(vi.fn().mockReturnValue(mockBuilder), {
    raw: vi.fn().mockReturnValue('raw_sql'),
  });
  return { mockBuilder, mockDb };
});

vi.mock('../../src/database/client.js', () => ({ db: mockDb }));

beforeEach(() => {
  vi.clearAllMocks();
  mockBuilder.insert.mockReturnThis();
  mockBuilder.where.mockReturnThis();
  mockBuilder.select.mockReturnThis();
  mockDb.mockReturnValue(mockBuilder);
});

describe('accounts — property based tests', () => {
  it('balance is always 0 for a new account regardless of input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 255 }),
        fc.constantFrom('USD', 'EUR', 'BTC', 'ETH', 'BRL'),
        fc.constantFrom(
          'ASSET' as const,
          'LIABILITY' as const,
          'EQUITY' as const,
          'REVENUE' as const,
          'EXPENSE' as const,
        ),
        async (name, currency, type) => {
          vi.clearAllMocks();
          mockBuilder.insert.mockReturnThis();
          mockBuilder.where.mockReturnThis();
          mockBuilder.select.mockReturnThis();
          mockDb.mockReturnValue(mockBuilder);
          mockBuilder.returning.mockResolvedValue([{ id: crypto.randomUUID(), name, type, currency, is_system: false, created_at: new Date() }]);
          mockBuilder.first.mockResolvedValue({ total_debits: '0', total_credits: '0' });

          const account = await createAccount({ name, type, currency, is_system: false });
          const balance = await computeBalance(account.id);

          expect(balance).toBe('0.000000000000000000');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('account id is always a valid UUID', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.constantFrom('USD', 'EUR', 'BTC'),
        fc.constantFrom('ASSET' as const, 'LIABILITY' as const),
        async (name, currency, type) => {
          vi.clearAllMocks();
          mockBuilder.insert.mockReturnThis();
          mockDb.mockReturnValue(mockBuilder);
          mockBuilder.returning.mockResolvedValue([{ id: crypto.randomUUID(), name, type, currency, is_system: false, created_at: new Date() }]);

          const account = await createAccount({ name, type, currency, is_system: false });
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

          expect(account.id).toMatch(uuidRegex);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('computeBalance arithmetic: debits minus credits always equals the balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        async (debits, credits) => {
          vi.clearAllMocks();
          mockBuilder.where.mockReturnThis();
          mockBuilder.select.mockReturnThis();
          mockDb.mockReturnValue(mockBuilder);
          mockBuilder.first.mockResolvedValue({
            total_debits: debits.toString(),
            total_credits: credits.toString(),
          });

          const balance = await computeBalance('any-account-id');
          const expected = new Decimal(debits).minus(credits).toFixed(18);

          expect(balance).toBe(expected);
        },
      ),
      { numRuns: 50 },
    );
  });
});
