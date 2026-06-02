import { Router } from 'express';
import accounts from './accounts.js';
import transfers from './transfers.js';
const router = Router();

router.use('/accounts', accounts);
router.use('/transfers', transfers);

export default router;
