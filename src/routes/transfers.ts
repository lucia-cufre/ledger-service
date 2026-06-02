import { Router, Request, Response, NextFunction } from 'express';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  createTransferSchema,
  voidTransferSchema,
} from '../lib/validators/transfers-validators.js';
import { createTransfer, getTransferById, voidTransfer } from '../services/tranfers/index.js';
import { storeIdempotencyKey } from '../services/idempotency-keys/index.js';
import { uuidSchema } from '../lib/validators/utils-validators.js';

const router = Router();

// ─── POST /transfers/ ─────────────────────────────────────────────────
router.post(
  '/',
  idempotencyMiddleware, 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createTransferSchema.parse(req.body);
      const transfer = await createTransfer(body);

      const responseBody = { transfer };
      const responseStatus = 201;

      // Store idempotency key + response atomically
      const key: string = res.locals['idempotencyKey'];
      const requestHash: string = res.locals['requestHash'];

      await storeIdempotencyKey(key, requestHash, responseStatus, responseBody);

      res.status(responseStatus).json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /transfers/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const transfer = await getTransferById(id);
    res.status(200).json({ transfer });
  } catch (err) {
    next(err);
  }
});

// ─── POST /transfers/:id/void ─────────────────────────────────────────────────
router.post('/:id/void', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuidSchema.parse(req.params.id);
    const { reason } = voidTransferSchema.parse(req.body);
    const reversal = await voidTransfer(id, reason);
    res.status(201).json({ transfer: reversal });
  } catch (err) {
    next(err);
  }
});

export default router;