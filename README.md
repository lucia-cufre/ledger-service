# ledger-service

## Introduction

A **double-entry accounting ledger** built as a financial primitive — the kind of system that sits at the core of payment processors, crypto exchanges, and neobanks to guarantee that money is never created or destroyed.

I built this project to understand how financial services operate under the hood — what it actually takes to build software that users can trust with their money. The result is a working REST API with accounts, transfers, voiding, and idempotency, backed by a database-level balance constraint that makes it impossible to produce an unbalanced ledger even under application failure.

**What stack and why?**

Node.js 22, TypeScript, Express 5, and PostgreSQL as the core. I chose PostgreSQL specifically because the balance-enforcement logic lives in the database itself as a constraint trigger — meaning even if the application misbehaves, the ledger still won't produce an unbalanced state. Knex as the query builder since it provides better control over migrations. Redis for distributed locking on concurrent writes. Decimal.js for precise arithmetic — floating-point errors in financial systems have real consequences. The full breakdown is in the [Stack](#stack) section below.

**What did I try for the first time?**

This project was also an experiment in how I work. I built it with AI guidance — using Claude Code not to generate code for me, but to ask questions, think through approaches, and refine decisions based on how I like to write and organize my code.

Some of the libraries Claude suggested I had never used before. After looking into them I decided to give them a try and see if they actually made sense for me and the codebase: Zod for validation, Pino for structured logging, and Vitest for testing. I had also never worked with Node.js v22 — the newest version I'd used before was v18.

Development is incremental — each step lives on its own branch with descriptive commits, so you can follow the full progression in the PRs.

## What is double-entry bookkeeping?

Every financial movement is recorded as two or more **entries**: a debit on one account and a matching credit on another. The amounts must balance — that's not just a rule enforced in code, but a PostgreSQL constraint trigger that rejects any imbalanced transfer at the database level. The application can misbehave; the ledger still won't lie.

## Core design

```
Transfer (idempotency_key, status: PENDING → POSTED | VOIDED)
  └── Entry (account_id, direction: DEBIT | CREDIT, amount NUMERIC(36,18), currency)
  └── Entry (account_id, direction: DEBIT | CREDIT, amount NUMERIC(36,18), currency)
  └── ...

Account (type: ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE, currency)
```

A **transfer** groups a set of entries into an atomic unit. A **posted** transfer is final and immutable; it can only be reversed by creating a new voiding transfer. This mirrors how real financial systems work — no silent mutations, full audit trail.

## Key engineering decisions

**Balance enforced at the database layer**
A PostgreSQL `CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED` fires after each entry insert/update and raises an exception if debits ≠ credits for the transfer. The deferred timing allows all entries of a transfer to be inserted within one transaction before the check runs, while still being atomic. Application bugs cannot produce an unbalanced ledger.

**High-precision arithmetic**
Amounts are stored as `NUMERIC(36, 18)` — 18 decimal places of scale — and handled in application code via `decimal.js`. This avoids the floating-point rounding errors that famously cost the Vancouver Stock Exchange 25 points of index value over years of accumulated drift.

**Idempotency**
Every write operation is keyed by a client-provided `idempotency_key`. The service stores the request hash and response, so duplicate requests (retries, network failures) return the original result without re-executing side effects. This is a hard requirement in any financial API.

**Transfer state machine**
Transfers follow a strict lifecycle: `PENDING → POSTED` or `PENDING → VOIDED`. Posted transfers are immutable. This prevents double-posting and gives a clear audit trail for every state change.

**Full chart of accounts**
Account types follow standard accounting categories: `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`. System accounts (flagged `is_system`) can be used for internal clearing and suspense entries.

**Multi-currency**
Both accounts and entries carry an explicit currency field, enabling cross-currency transfers and per-currency balance queries.

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/accounts` | List all accounts |
| `GET` | `/accounts/:id` | Get account by ID |
| `POST` | `/accounts` | Create an account |
| `POST` | `/transfers` | Create a transfer (idempotent) |
| `GET` | `/transfers/:id` | Get transfer with entries |
| `GET` | `/transfers/all/:accountId` | Get all transfers for an account |
| `POST` | `/transfers/:id/void` | Void a posted transfer |

All write operations that mutate state require an `Idempotency-Key` header. Duplicate requests return the original response without re-executing side effects.

## Stack

| Layer            | Technology                           |
| ---------------- | ------------------------------------ |
| Runtime          | Node.js 22 / TypeScript (ESM)        |
| Framework        | Express 5                            |
| Database         | PostgreSQL 16                        |
| Cache / locks    | Redis 7                              |
| Query builder    | Knex                                 |
| Validation       | Zod                                  |
| Arithmetic       | Decimal.js                           |
| Logging          | Pino (structured JSON)               |
| Testing          | Vitest + fast-check (property-based) |
| Containerization | Docker / Docker Compose              |

## Getting started

**Prerequisites:** Docker, Node.js 22+

**1. Clone and install**

```bash
git clone <repo-url>
cd ledger-service
npm install
```

**2. Configure environment**

```bash
cp .env.example .env
```

The defaults in `.env.example` work out of the box with the Docker Compose setup:

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://ledger:ledger@localhost:5432/ledger
REDIS_URL=redis://localhost:6379
LOG_LEVEL=debug
```

**3. Start infrastructure**

```bash
npm run docker:up   # starts PostgreSQL 16 and Redis 7
```

**4. Run migrations**

```bash
npm run migrate:latest
```

This creates the `accounts`, `transfers`, `entries`, and `idempotency_keys` tables, and installs the balance-enforcement trigger.

**5. Start the dev server**

```bash
npm run dev   # hot reload via tsx watch
```

The API will be available at `http://localhost:4000`. Verify with:

```bash
curl http://localhost:4000/health
# {"status":"ok","timestamp":"..."}
```

**Run tests**

```bash
npm test               # single run
npm run test:watch     # watch mode
npm run test:coverage  # with coverage report
```

**Other useful commands**

```bash
npm run migrate:status    # check which migrations have run
npm run migrate:rollback  # roll back the last batch
npm run lint              # ESLint
npm run format            # Prettier
npm run docker:down       # stop containers
```

## Project structure

```
src/
  app.ts                        # Express app factory
  index.ts                      # Server entrypoint
  config/env.ts                 # Typed environment config (Zod)
  lib/
    errors.ts                   # Typed error hierarchy
    logger.ts                   # Structured logger (Pino)
    validators/
      account-validators.ts
      transfers-validators.ts
      utils-validators.ts
  middleware/
    errorHandler.ts             # Centralized error → HTTP response
    idempotency.ts              # Idempotency-Key enforcement
  routes/
    index.ts
    accounts.ts
    transfers.ts
  services/
    accounts/index.ts
    transfers/index.ts
    idempotency-keys/index.ts
  database/
    client.ts
    models/                     # TypeScript types for DB entities
      accountModel.ts
      transferModel.ts
      entriesModel.ts
      idempotencyKeysModel.ts

knex/
  migrations/                   # Schema migrations (Knex)
    test.ts
    accounts.ts
    transfers.ts
    entries.ts                  # Includes balance-enforcement trigger
    idempotency_keys.ts
```

## Why this matters

A ledger is not a transactions table. It is the source of truth for every balance, every reconciliation, and every audit. Getting it wrong means money disappears or appears from nowhere — the consequences are regulatory, financial, and reputational.

The design choices here (constraint triggers, deferred checks, idempotency, immutable history, precise numerics) are not over-engineering — they are the baseline expectations of any team building financial infrastructure. This service is designed to be embedded as the accounting core of a payments product, a crypto exchange, or any system where balance integrity is non-negotiable.
