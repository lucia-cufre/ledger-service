import { Router, type Request, type Response, type NextFunction } from 'express';
import { uuidSchema } from '../lib/validators/utils-validators.js';
import { createAccount, getAccountById, listAccounts } from '../services/accounts/index.js';
import { createAccountSchema } from '../lib/validators/account-validators.js';

const router = Router();

// ─── GET /accounts/ ─────────────────────────────────────────────────
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const accounts = await listAccounts();
    res.status(200).json({ accounts });
  } catch (err) {
    next(err);
  }
});

// ─── GET /accounts/:id ─────────────────────────────────────────────────
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuidSchema.parse(req.params['id']);
    const account = await getAccountById(id);
    res.status(200).json({ account });
  } catch (err) {
    next(err);
  }
});

// ─── POST /accounts/ ─────────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = createAccountSchema.parse(req.body);
    const account = await createAccount(body);
    res.status(201).json({ account });
  } catch (err) {
    next(err);
  }
});

export default router;
