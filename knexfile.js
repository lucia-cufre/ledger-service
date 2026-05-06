import 'dotenv/config';

/** @type {Object.<string, import('knex').Knex.Config>} */

const config = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './knex/migrations',
      extension: 'ts',
      tableName: 'knex_migrations',
    },
  },

  test: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      directory: './knex/migrations',
      extension: 'ts',
      tableName: 'knex_migrations',
    },
  },

  production: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
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
  },
};

export default config;