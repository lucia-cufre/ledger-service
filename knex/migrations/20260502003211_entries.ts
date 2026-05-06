import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('entries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));

    table
      .uuid('transfer_id')
      .notNullable()
      .references('id')
      .inTable('transfers')
      .onDelete('RESTRICT'); 

    table
      .uuid('account_id')
      .notNullable()
      .references('id')
      .inTable('accounts')
      .onDelete('RESTRICT'); 

    table.enum('direction', ['DEBIT', 'CREDIT']).notNullable();

    // Use NUMERIC(36, 18) for high precision financial amounts and avoid Vancouver Stock Exchange issues
    table.specificType('amount', 'NUMERIC(36, 18)').notNullable();

    table.string('currency', 10).notNullable();

    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('entries', (table) => {
    table.index(['transfer_id'], 'idx_entries_transfer_id');
    table.index(['account_id'], 'idx_entries_account_id');
    table.index(['account_id', 'currency'], 'idx_entries_account_currency');
  });

  // Database-level constraint: for every transfer,
  // sum of debits must equal sum of credits.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION check_transfer_balance()
    RETURNS TRIGGER AS $$
    DECLARE
      debit_sum  NUMERIC;
      credit_sum NUMERIC;
    BEGIN
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'DEBIT'  THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0)
      INTO debit_sum, credit_sum
      FROM entries
      WHERE transfer_id = NEW.transfer_id;

      IF debit_sum != credit_sum THEN
        RAISE EXCEPTION
          'Transfer % is unbalanced: debits=% credits=%',
          NEW.transfer_id, debit_sum, credit_sum;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await knex.raw(`
    CREATE CONSTRAINT TRIGGER enforce_transfer_balance
    AFTER INSERT OR UPDATE ON entries
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION check_transfer_balance();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TRIGGER IF EXISTS enforce_transfer_balance ON entries');
  await knex.raw('DROP FUNCTION IF EXISTS check_transfer_balance');
  await knex.schema.dropTableIfExists('entries');
}
