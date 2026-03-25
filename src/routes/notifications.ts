import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/notifications.controller';

const router = Router();
router.use(authenticate);

router.get('/', (req, res, next) => ctrl.listNotifications(req as AuthRequest, res, next));
router.put('/read-all', (req, res, next) => ctrl.markAllRead(req as AuthRequest, res, next));
router.put('/:id/read', (req, res, next) => ctrl.markRead(req as AuthRequest, res, next));

export default router;
