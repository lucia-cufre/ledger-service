import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Enable pgcrypto for gen_random_uuid()
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable('accounts', (table) => {
    table
      .uuid('id')
      .primary()
      .defaultTo(knex.raw('gen_random_uuid()'));

    table
      .string('name', 255)
      .notNullable();

    table
      .enum('type', [
        'ASSET',
        'LIABILITY',
        'EQUITY',
        'REVENUE',
        'EXPENSE',
      ])
      .notNullable();

    table
      .string('currency', 10)
      .notNullable();

    table
      .text('description')
      .nullable();

    table
      .boolean('is_system')
      .notNullable()
      .defaultTo(false);

    table
      .timestamps(true, true);
  });

  await knex.schema.alterTable('accounts', (table) => {
    table.index(['type'], 'idx_accounts_type');
    table.index(['currency'], 'idx_accounts_currency');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('accounts');
}