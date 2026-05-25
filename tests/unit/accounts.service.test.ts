import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeBalance, createAccount } from '../../src/services/accounts/index.js';

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

const fakeAccount = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Test Account',
  type: 'ASSET',
  currency: 'USD',
  description: null,
  is_system: false,
  created_at: new Date('2024-01-01'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuilder.insert.mockReturnThis();
  mockBuilder.where.mockReturnThis();
  mockBuilder.select.mockReturnThis();
  mockBuilder.orderBy.mockReturnThis();
  mockDb.mockReturnValue(mockBuilder);
});

describe('computeBalance', () => {
  it('returns 0 balance for account with no entries', async () => {
    mockBuilder.returning.mockResolvedValue([fakeAccount]);
    mockBuilder.first.mockResolvedValue({ total_debits: '0', total_credits: '0' });

    const account = await createAccount({ name: 'Test Account', type: 'ASSET', currency: 'USD', is_system: false });
    const balance = await computeBalance(account.id);

    expect(balance).toBe('0.000000000000000000');
  });

  it('computes positive balance from debits', async () => {
    mockBuilder.returning.mockResolvedValue([fakeAccount]);
    mockBuilder.first.mockResolvedValue({ total_debits: '150.00', total_credits: '0' });

    const account = await createAccount({ name: 'Test Account', type: 'ASSET', currency: 'USD', is_system: false });
    const balance = await computeBalance(account.id);

    expect(balance).toBe('150.000000000000000000');
  });

  it('computes balance correctly with both debits and credits', async () => {
    mockBuilder.returning.mockResolvedValue([fakeAccount]);
    mockBuilder.first.mockResolvedValue({ total_debits: '200.00', total_credits: '75.00' });

    const account = await createAccount({ name: 'Test Account', type: 'ASSET', currency: 'USD', is_system: false });
    const balance = await computeBalance(account.id);

    expect(balance).toBe('125.000000000000000000');
  });

  it('handles crypto precision correctly — 18 decimal places', async () => {
    mockBuilder.returning.mockResolvedValue([{ ...fakeAccount, currency: 'ETH' }]);
    mockBuilder.first.mockResolvedValue({ total_debits: '0.000000000000000001', total_credits: '0' });

    const account = await createAccount({ name: 'ETH Account', type: 'ASSET', currency: 'ETH', is_system: false });
    const balance = await computeBalance(account.id);

    expect(balance).toBe('0.000000000000000001');
  });
});

describe('createAccount', () => {
  it('creates an account with correct fields', async () => {
    mockBuilder.returning.mockResolvedValue([{ ...fakeAccount, name: 'Alice USD', description: 'Test account' }]);

    const account = await createAccount({
      name: 'Alice USD',
      type: 'ASSET',
      currency: 'USD',
      description: 'Test account',
      is_system: false,
    });

    expect(account.id).toBeDefined();
    expect(account.name).toBe('Alice USD');
    expect(account.type).toBe('ASSET');
    expect(account.currency).toBe('USD');
    expect(account.description).toBe('Test account');
    expect(account.is_system).toBe(false);
    expect(account.created_at).toBeDefined();
  });

  it('defaults is_system to false', async () => {
    mockBuilder.returning.mockResolvedValue([{ ...fakeAccount, is_system: false }]);

    const account = await createAccount({ name: 'Test', type: 'ASSET', currency: 'USD', is_system: false });

    expect(account.is_system).toBe(false);
  });

  it('creates a system account when is_system is true', async () => {
    mockBuilder.returning.mockResolvedValue([{ ...fakeAccount, name: 'Platform Fees', type: 'REVENUE', is_system: true }]);

    const account = await createAccount({ name: 'Platform Fees', type: 'REVENUE', currency: 'USD', is_system: true });

    expect(account.is_system).toBe(true);
  });
});
