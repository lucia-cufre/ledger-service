import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createApp } from '../../src/app.js';
import { db } from '../../src/database/client.js';

const app = createApp();
const request = supertest(app);

const unique = () => crypto.randomUUID();

let senderAccountId: string;
let receiverAccountId: string;
let revenueAccountId: string;

beforeAll(async () => {
  const sender = await request
    .post('/accounts')
    .send({ name: `Sender-${unique()}`, type: 'ASSET', currency: 'USD' });
  senderAccountId = sender.body.account.id;

  const receiver = await request
    .post('/accounts')
    .send({ name: `Receiver-${unique()}`, type: 'ASSET', currency: 'USD' });
  receiverAccountId = receiver.body.account.id;

  const revenue = await request
    .post('/accounts')
    .send({ name: `Revenue-${unique()}`, type: 'REVENUE', currency: 'USD', is_system: true });
  revenueAccountId = revenue.body.account.id;
});

afterAll(async () => {
  await db.destroy();
});

async function fundSender(amount = '1000.00') {
  const key = unique();
  const response = await request
    .post('/transfers')
    .set('Idempotency-Key', key)
    .send({
      idempotency_key: key,
      description: 'Fund sender',
      entries: [
        { account_id: senderAccountId, direction: 'DEBIT', amount, currency: 'USD' },
        { account_id: revenueAccountId, direction: 'CREDIT', amount, currency: 'USD' },
      ],
    });
  return response.body.transfer.id;
}

describe('POST /transfers', () => {
  it('creates a deposit transfer successfully', async () => {
    const key = unique();
    const response = await request
      .post('/transfers')
      .set('Idempotency-Key', key)
      .send({
        idempotency_key: key,
        description: 'Deposit',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '500.00', currency: 'USD' },
          { account_id: revenueAccountId, direction: 'CREDIT', amount: '500.00', currency: 'USD' },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.transfer.status).toBe('POSTED');
    expect(response.body.transfer.entries).toHaveLength(2);
  });

  it('returns 400 when idempotency key header is missing', async () => {
    const response = await request.post('/transfers').send({
      idempotency_key: unique(),
      description: 'No header',
      entries: [
        { account_id: senderAccountId, direction: 'DEBIT', amount: '10.00', currency: 'USD' },
        { account_id: revenueAccountId, direction: 'CREDIT', amount: '10.00', currency: 'USD' },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('MISSING_IDEMPOTENCY_KEY');
  });

  it('replays response on duplicate idempotency key', async () => {
    const key = unique();
    const body = {
      idempotency_key: key,
      description: 'Idempotency test',
      entries: [
        { account_id: senderAccountId, direction: 'DEBIT', amount: '10.00', currency: 'USD' },
        { account_id: revenueAccountId, direction: 'CREDIT', amount: '10.00', currency: 'USD' },
      ],
    };

    const first = await request.post('/transfers').set('Idempotency-Key', key).send(body);

    const second = await request.post('/transfers').set('Idempotency-Key', key).send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.transfer.id).toBe(first.body.transfer.id);
  });

  it('returns 409 on same key with different body', async () => {
    const key = unique();

    await request
      .post('/transfers')
      .set('Idempotency-Key', key)
      .send({
        idempotency_key: key,
        description: 'Original',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '10.00', currency: 'USD' },
          { account_id: revenueAccountId, direction: 'CREDIT', amount: '10.00', currency: 'USD' },
        ],
      });

    const response = await request
      .post('/transfers')
      .set('Idempotency-Key', key)
      .send({
        idempotency_key: key,
        description: 'Different body',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '10.00', currency: 'USD' },
          { account_id: revenueAccountId, direction: 'CREDIT', amount: '10.00', currency: 'USD' },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('returns 400 when entries are unbalanced', async () => {
    const response = await request
      .post('/transfers')
      .set('Idempotency-Key', unique())
      .send({
        idempotency_key: unique(),
        description: 'Unbalanced',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '100.00', currency: 'USD' },
          { account_id: receiverAccountId, direction: 'CREDIT', amount: '50.00', currency: 'USD' },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 422 when ASSET account has insufficient funds', async () => {
    const response = await request
      .post('/transfers')
      .set('Idempotency-Key', unique())
      .send({
        idempotency_key: unique(),
        description: 'Overdraft',
        entries: [
          { account_id: senderAccountId, direction: 'CREDIT', amount: '999999.00', currency: 'USD' },
          { account_id: receiverAccountId, direction: 'DEBIT', amount: '999999.00', currency: 'USD' },
        ],
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('INSUFFICIENT_FUNDS');
  });

  it('does not check funds for REVENUE accounts', async () => {
    const key = unique();
    const response = await request
      .post('/transfers')
      .set('Idempotency-Key', key)
      .send({
        idempotency_key: key,
        description: 'Deposit to fresh revenue account',
        entries: [
          { account_id: senderAccountId, direction: 'DEBIT', amount: '1.00', currency: 'USD' },
          { account_id: revenueAccountId, direction: 'CREDIT', amount: '1.00', currency: 'USD' },
        ],
      });

    expect(response.status).toBe(201);
  });
});

describe('GET /transfers/:id', () => {
  let transferId: string;

  beforeAll(async () => {
    transferId = await fundSender();
  });

  it('returns transfer with entries', async () => {
    const response = await request.get(`/transfers/${transferId}`);

    expect(response.status).toBe(200);
    expect(response.body.transfer.id).toBe(transferId);
    expect(response.body.transfer.entries).toHaveLength(2);
  });

  it('returns 404 for non-existent transfer', async () => {
    const response = await request.get('/transfers/00000000-0000-0000-0000-000000000000');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for invalid UUID', async () => {
    const response = await request.get('/transfers/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /transfers/:id/void', () => {
  it('voids a posted transfer and creates reversal', async () => {
    const transferId = await fundSender();

    const response = await request
      .post(`/transfers/${transferId}/void`)
      .send({ reason: 'Test void' });

    expect(response.status).toBe(201);
    expect(response.body.transfer.status).toBe('POSTED');

    const debitEntry = response.body.transfer.entries.find(
      (e: { direction: string }) => e.direction === 'DEBIT',
    );
    const creditEntry = response.body.transfer.entries.find(
      (e: { direction: string }) => e.direction === 'CREDIT',
    );
    expect(debitEntry).toBeDefined();
    expect(creditEntry).toBeDefined();
  });

  it('returns 409 when voiding an already voided transfer', async () => {
    const transferId = await fundSender();

    await request.post(`/transfers/${transferId}/void`).send({ reason: 'First void' });

    const response = await request
      .post(`/transfers/${transferId}/void`)
      .send({ reason: 'Second void' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 when reason is missing', async () => {
    const transferId = await fundSender();

    const response = await request.post(`/transfers/${transferId}/void`).send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
