import { describe, it, expect, vi, beforeEach } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { NotFoundError } from '../../src/lib/errors.js';

const { mockCreateAccount, mockGetAccountById, mockListAccounts } = vi.hoisted(() => ({
  mockCreateAccount: vi.fn(),
  mockGetAccountById: vi.fn(),
  mockListAccounts: vi.fn(),
}));

vi.mock('../../src/services/accounts/index.js', () => ({
  createAccount: mockCreateAccount,
  getAccountById: mockGetAccountById,
  listAccounts: mockListAccounts,
}));

const app = createApp();
const request = supertest(app);

const fakeAccount = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Alice USD Wallet',
  type: 'ASSET',
  currency: 'USD',
  description: 'Alice primary account',
  is_system: false,
  created_at: new Date('2024-01-01').toISOString(),
  balance: '0.000000000000000000',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /accounts', () => {
  it('creates an account and returns 201', async () => {
    mockCreateAccount.mockResolvedValue(fakeAccount);

    const response = await request.post('/accounts').send({
      name: 'Alice USD Wallet',
      type: 'ASSET',
      currency: 'USD',
      description: 'Alice primary account',
    });

    expect(response.status).toBe(201);
    expect(response.body.account).toMatchObject({
      name: 'Alice USD Wallet',
      type: 'ASSET',
      currency: 'USD',
      description: 'Alice primary account',
      is_system: false,
    });
    expect(response.body.account.id).toBeDefined();
  });

  it('uppercases currency before calling the service', async () => {
    mockCreateAccount.mockResolvedValue({ ...fakeAccount, name: 'Test', currency: 'USD' });

    const response = await request.post('/accounts').send({
      name: 'Test',
      type: 'ASSET',
      currency: 'usd',
    });

    expect(response.status).toBe(201);
    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({ currency: 'USD' }),
    );
  });

  it('trims whitespace from name before calling the service', async () => {
    mockCreateAccount.mockResolvedValue({ ...fakeAccount, name: 'Trimmed' });

    const response = await request.post('/accounts').send({
      name: '  Trimmed  ',
      type: 'ASSET',
      currency: 'USD',
    });

    expect(response.status).toBe(201);
    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Trimmed' }),
    );
  });

  it('accepts is_system: true', async () => {
    mockCreateAccount.mockResolvedValue({ ...fakeAccount, is_system: true });

    const response = await request.post('/accounts').send({
      name: 'System Account',
      type: 'EQUITY',
      currency: 'USD',
      is_system: true,
    });

    expect(response.status).toBe(201);
    expect(mockCreateAccount).toHaveBeenCalledWith(
      expect.objectContaining({ is_system: true }),
    );
  });

  it('returns 400 when name is empty', async () => {
    const response = await request.post('/accounts').send({
      name: '',
      type: 'ASSET',
      currency: 'USD',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.name).toBeDefined();
  });

  it('returns 400 when name exceeds 255 characters', async () => {
    const response = await request.post('/accounts').send({
      name: 'a'.repeat(256),
      type: 'ASSET',
      currency: 'USD',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.name).toBeDefined();
  });

  it('returns 400 when type is invalid', async () => {
    const response = await request.post('/accounts').send({
      name: 'Test',
      type: 'BANANA',
      currency: 'USD',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 when currency is too short', async () => {
    const response = await request.post('/accounts').send({
      name: 'Test',
      type: 'ASSET',
      currency: 'U',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.currency).toBeDefined();
  });

  it('returns 400 when currency is too long', async () => {
    const response = await request.post('/accounts').send({
      name: 'Test',
      type: 'ASSET',
      currency: 'X'.repeat(11),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.currency).toBeDefined();
  });

  it('returns 400 when description exceeds 500 characters', async () => {
    const response = await request.post('/accounts').send({
      name: 'Test',
      type: 'ASSET',
      currency: 'USD',
      description: 'a'.repeat(501),
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.description).toBeDefined();
  });

  it('returns 400 when required fields are missing', async () => {
    const response = await request.post('/accounts').send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockCreateAccount.mockRejectedValue(new Error('db exploded'));

    const response = await request.post('/accounts').send({
      name: 'Test',
      type: 'ASSET',
      currency: 'USD',
    });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /accounts/:id', () => {
  it('returns account with zero balance when no entries exist', async () => {
    mockGetAccountById.mockResolvedValue({ ...fakeAccount, name: 'Alice' });

    const response = await request.get(`/accounts/${fakeAccount.id}`);

    expect(response.status).toBe(200);
    expect(response.body.account.balance).toBe('0.000000000000000000');
  });

  it('returns 404 for non-existent account', async () => {
    const missingId = '00000000-0000-0000-0000-000000000000';
    mockGetAccountById.mockRejectedValue(new NotFoundError('Account', missingId));

    const response = await request.get(`/accounts/${missingId}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid UUID', async () => {
    const response = await request.get('/accounts/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockGetAccountById.mockRejectedValue(new Error('db exploded'));

    const response = await request.get(`/accounts/${fakeAccount.id}`);

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});

describe('GET /accounts', () => {
  it('returns empty array when no accounts exist', async () => {
    mockListAccounts.mockResolvedValue([]);

    const response = await request.get('/accounts');

    expect(response.status).toBe(200);
    expect(response.body.accounts).toEqual([]);
  });

  it('returns all accounts with balances', async () => {
    mockListAccounts.mockResolvedValue([
      { ...fakeAccount, name: 'Alice' },
      { ...fakeAccount, id: '550e8400-e29b-41d4-a716-446655440001', name: 'Bob' },
    ]);

    const response = await request.get('/accounts');

    expect(response.status).toBe(200);
    expect(response.body.accounts).toHaveLength(2);
    expect(response.body.accounts[0].balance).toBeDefined();
    expect(response.body.accounts[1].balance).toBeDefined();
  });

  it('returns 500 when the service throws an unexpected error', async () => {
    mockListAccounts.mockRejectedValue(new Error('db exploded'));

    const response = await request.get('/accounts');

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
