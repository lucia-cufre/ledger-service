import type { Knex } from "knex";


export async function up(knex: Knex): Promise<void> {
    await knex.schema.createTable('idempotency_keys', (table) => {
    table
      .string('key', 255)
      .primary();

    table
      .string('request_hash', 64)
      .notNullable();

    table
      .jsonb('response_body')
      .notNullable();

    table
      .integer('response_status')
      .notNullable();

    table
      .timestamp('created_at', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    table
      .timestamp('expires_at', { useTz: true })
      .notNullable();
  });

  await knex.schema.alterTable('idempotency_keys', (table) => {
    table.index(['expires_at'], 'idx_idempotency_keys_expires_at');
  });
}


export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('idempotency_keys');
}

