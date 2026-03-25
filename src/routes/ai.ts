import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/ai.controller';

const router = Router();
router.use(authenticate);

router.post('/parse-task', (req, res, next) => ctrl.parseTask(req as AuthRequest, res, next));
router.post('/chat', (req, res, next) => ctrl.chat(req as AuthRequest, res, next));

export default router;
