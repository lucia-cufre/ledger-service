import { Router } from 'express';
import accounts from './accounts.js';
const router = Router();

router.use('/accounts', accounts);

export default router;
