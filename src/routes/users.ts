import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/users.controller';

const router = Router();
router.use(authenticate);

router.get('/me', (req, res, next) => ctrl.getMe(req as AuthRequest, res, next));
router.put('/me', (req, res, next) => ctrl.updateMe(req as AuthRequest, res, next));
router.put('/me/password', (req, res, next) => ctrl.changePassword(req as AuthRequest, res, next));

export default router;
