import knex from 'knex';
import { env } from '../config/env.js';

export const db = knex({
  client: 'pg',
  connection: env.DATABASE_URL,
  pool: {
    min: 2,
    max: 10,
  },
  migrations: {
    directory: './knex/migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: './knex/seeds',
    extension: 'ts',
  },
  debug: env.NODE_ENV === 'development',
});
