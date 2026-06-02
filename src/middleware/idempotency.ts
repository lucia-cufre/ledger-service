import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../database/client.js';
import { logger } from '../lib/logger.js';
import { IdempotencyKey } from '../database/models/idempotencyKeysModel.js';

function hashRequestBody(body: unknown): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(body))
    .digest('hex');
}

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const key = req.headers['idempotency-key'] as string | undefined;

  if (!key) {
    res.status(400).json({
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required',
        request_id: req.headers['x-request-id'],
      },
    });
    return;
  }

  const requestHash = hashRequestBody(req.body);

  try {
    const existing: IdempotencyKey = await db('idempotency_keys')
      .where({ key })
      .first();

    if (existing) {
      if (existing.request_hash === requestHash) {
        logger.info({ key }, 'Idempotency key hit — replaying response');
        res
          .status(existing.response_status)
          .json(existing.response_body);
        return;
      }

      res.status(409).json({
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message:
            'This idempotency key was already used with a different request body',
          request_id: req.headers['x-request-id'],
        },
      });
      return;
    }

    res.locals['idempotencyKey'] = key;
    res.locals['requestHash'] = requestHash;

    next();
  } catch (err) {
    next(err);
  }
}
