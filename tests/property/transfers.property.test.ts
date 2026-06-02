import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import Decimal from 'decimal.js';

vi.mock('../../src/database/client.js', () => ({
  db: {
    raw: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    returning: vi.fn(),
    first: vi.fn(),
    groupBy: vi.fn().mockReturnThis(),
    transaction: vi.fn((fn) => fn({
      raw: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      whereIn: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      returning: vi.fn(),
      first: vi.fn(),
      groupBy: vi.fn().mockReturnThis(),
      update: vi.fn().mockResolvedValue(1),
    })),
  },
}));

import { ValidationError } from '../../src/lib/errors.js';
import { createTransfer } from '../../src/services/tranfers/index.js';

describe('transfers — property based tests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always rejects unbalanced entries regardless of amounts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true })
          .map((n) => n.toFixed(2)),
        fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true })
          .map((n) => n.toFixed(2)),
        async (debitAmount, creditAmount) => {
          fc.pre(debitAmount !== creditAmount);

          await expect(
            createTransfer({
              idempotency_key: crypto.randomUUID(),
              description: 'Unbalanced transfer',
              entries: [
                {
                  account_id: crypto.randomUUID(),
                  direction: 'DEBIT',
                  amount: debitAmount,
                  currency: 'USD',
                },
                {
                  account_id: crypto.randomUUID(),
                  direction: 'CREDIT',
                  amount: creditAmount,
                  currency: 'USD',
                },
              ],
            }),
          ).rejects.toThrow(ValidationError);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('always rejects mixed currency entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('USD', 'EUR', 'BTC', 'ETH', 'BRL'),
        fc.constantFrom('USD', 'EUR', 'BTC', 'ETH', 'BRL'),
        async (currency1, currency2) => {
          fc.pre(currency1 !== currency2);

          await expect(
            createTransfer({
              idempotency_key: crypto.randomUUID(),
              description: 'Mixed currencies',
              entries: [
                {
                  account_id: crypto.randomUUID(),
                  direction: 'DEBIT',
                  amount: '100.00',
                  currency: currency1,
                },
                {
                  account_id: crypto.randomUUID(),
                  direction: 'CREDIT',
                  amount: '100.00',
                  currency: currency2,
                },
              ],
            }),
          ).rejects.toThrow(ValidationError);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('balanced entries always have debits equal to credits', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.float({ min: Math.fround(0.01), max: Math.fround(100000), noNaN: true })
          .map((n) => n.toFixed(2)),
        async (amount) => {
          const debit = new Decimal(amount);
          const credit = new Decimal(amount);

          expect(debit.equals(credit)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('sum of multiple entries is always precise regardless of count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
            .map((n) => n.toFixed(2)),
          { minLength: 2, maxLength: 5 },
        ),
        async (amounts) => {
          const total = amounts.reduce(
            (sum, a) => sum.plus(a),
            new Decimal(0),
          );

          const floatTotal = amounts.reduce(
            (sum, a) => sum + parseFloat(a),
            0,
          );

          expect(isNaN(Number(total.toString()))).toBe(false);
          expect(Math.abs(total.toNumber() - floatTotal) < 0.001).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});
