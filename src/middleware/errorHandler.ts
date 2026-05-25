import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { ApplicationError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function zodFieldErrors(err: ZodError): Record<string, string[]> {
  return err.issues.reduce<Record<string, string[]>>((acc, issue) => {
    const key = issue.path[0] as string;
    if (key) {
      acc[key] = [...(acc[key] ?? []), issue.message];
    }
    return acc;
  }, {});
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): Response {
  const requestId = req.headers['x-request-id'];

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: zodFieldErrors(err),
        request_id: requestId,
      },
    });
  }

  // Known application errors
  if (err instanceof ApplicationError) {
    logger.warn({ err, requestId }, err.message);
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        request_id: requestId,
      },
    });
  }

  // Unknown errors
  logger.error({ err, requestId }, 'Unhandled error');
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      request_id: requestId,
    },
  });
}