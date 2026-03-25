import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/search.controller';

const router = Router();
router.use(authenticate);

router.get('/', (req, res, next) => ctrl.search(req as AuthRequest, res, next));

export default router;
