import { Router, Request, Response, NextFunction } from 'express';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  createTransferSchema,
  voidTransferSchema,
} from '../lib/validators/transfers-validators.js';
import { createTransfer, getTransferById, listTransfers, voidTransfer } from '../services/transfers/index.js';
import { storeIdempotencyKey } from '../services/idempotency-keys/index.js';
import { uuidSchema } from '../lib/validators/utils-validators.js';

const router = Router();

// ─── GET /transfers/all/:accountId─────────────────────
router.get('/all/:accountId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const account_id = req.params.accountId as string | undefined;
    const limit = Math.min(Number(req.query['limit'] ?? 20), 100);
    const offset = Number(req.query['offset'] ?? 0);
    const transfers = await listTransfers({ account_id, limit, offset });
    res.status(200).json({ transfers });
  } catch (err) {
    next(err);
  }
});

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

// ─── POST /transfers/ ─────────────────────────────────────────────────────────
router.post(
  '/',
  idempotencyMiddleware,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = createTransferSchema.parse(req.body);
      const transfer = await createTransfer(body);

      const responseBody = { transfer };
      const responseStatus = 201;

      const key: string = res.locals['idempotencyKey'];
      const requestHash: string = res.locals['requestHash'];

      await storeIdempotencyKey(key, requestHash, responseStatus, responseBody);

      res.status(responseStatus).json(responseBody);
    } catch (err) {
      next(err);
    }
  },
);

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
