import { createApp } from './app.js';
import { env } from './config/env.js';
import { db } from './database/migrationService.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Ledger service listening on port ${env.PORT}`);
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await db.destroy();
    logger.info('Database connection pool closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));