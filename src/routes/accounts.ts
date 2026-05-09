import { Router, type Request, type Response, type NextFunction } from 'express';
import { createAccountSchema, uuidSchema } from '../lib/validators.js';
import { createAccount, getAccountById, listAccounts } from '../services/accounts/index.js';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const accounts = await listAccounts();
    res.status(200).json({ accounts });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = uuidSchema.parse(req.params['id']);
    const account = await getAccountById(id);
    res.status(200).json({ account });
  } catch (err) {
    next(err);
  }
});

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
