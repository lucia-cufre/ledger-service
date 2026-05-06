# Knex Migrations & Seeds

### Overview

This project uses **Knex.js** for database migrations and seeds management. This replaces the legacy SQL scripts system.

### Directory Structure

| Directory | Status | Purpose |
|-----------|--------|---------|
| `knex/migrations/` | **Active** | Schema changes + data migrations |
| `knex/seeds/` | **Active** | Initial data for new instances |

### Available Commands

```bash
# Run all pending migrations
npm run migrate:latest

# Check migration status
npm run migrate:status

# Rollback last migration batch
npm run migrate:rollback

# Create a new migration
npm run migrate:make migration_name

# Run all seeds (for new instances only)
npm run seed:run

# Create a new seed
npm run seed:make seed_name
```

### Creating Migrations

#### Schema Migration (table changes)

```bash
npm run migrate:make add_column_to_users
```

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable('users', (table) => {
        table.string('phone_number').nullable();
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.schema.alterTable('users', (table) => {
        table.dropColumn('phone_number');
    });
}
```

#### Data Migration (inserting/updating data)

**IMPORTANT:** Always use idempotent patterns to prevent duplicate data if the migration runs on a server where the data already exists.

```bash
npm run migrate:make add_new_toms_category
```

```typescript
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    // Pattern 1: INSERT with ON CONFLICT (recommended)
    await knex.raw(`
        INSERT INTO toms_categories (id, name, description)
        VALUES (99, 'New Category', 'Description here')
        ON CONFLICT (id) DO NOTHING
    `);

    // Pattern 2: Check before insert
    const exists = await knex('toms_entries')
        .where('id', 123)
        .first();

    if (!exists) {
        await knex('toms_entries').insert({
            id: 123,
            name: 'New Entry',
        });
    }

    // Pattern 3: Upsert (insert or update)
    await knex.raw(`
        INSERT INTO settings (key, value)
        VALUES ('feature_enabled', 'true')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `);
}

export async function down(knex: Knex): Promise<void> {
    // Optional: revert if possible
    await knex('toms_categories').where('id', 99).del();
}
```

### Idempotent Patterns Reference

| Operation | Safe Pattern |
|-----------|--------------|
| INSERT | `INSERT ... ON CONFLICT (id) DO NOTHING` |
| UPDATE | `UPDATE ... WHERE condition AND column != new_value` |
| DELETE | Already idempotent by nature |
| UPSERT | `INSERT ... ON CONFLICT (key) DO UPDATE SET ...` |

### Seeds

Seeds are for **initial data on new instances only**. They are NOT tracked like migrations and will run every time you execute `npm run seed:run`.

Seeds run in alphabetical order. Use numeric prefixes:
- `01_workflows.ts`
- `02_tasks.ts`
- `03_toms_categories.ts`

### Automatic Execution

Migrations run automatically on container startup via `docker-entrypoint.sh`:

```bash
npm run migrate:latest
```

Seeds do **NOT** run automatically. Run them manually for new instances:

```bash
npm run seed:run
```
