import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('transfers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table.string('idempotency_key', 255).notNullable().unique();

    table.text('description').notNullable();

    table.enum('status', ['PENDING', 'POSTED', 'VOIDED']).notNullable().defaultTo('PENDING');

    // Flexible metadata — store anything extra here
    // e.g. { "user_id": "123", "reference": "INV-001" }
    table.jsonb('metadata').nullable();

    table.timestamp('posted_at', { useTz: true }).nullable();

    table.timestamp('voided_at', { useTz: true }).nullable();

    table.timestamps(true, true);
  });

  await knex.schema.alterTable('transfers', (table) => {
    table.index(['idempotency_key'], 'idx_transfers_idempotency_key');
    table.index(['status'], 'idx_transfers_status');
    table.index(['created_at'], 'idx_transfers_created_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('transfers');
}
