import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/dashboard.controller';

const router = Router();
router.use(authenticate);

router.get('/my-tasks', (req, res, next) => ctrl.myTasks(req as AuthRequest, res, next));
router.get('/projects/:pid', (req, res, next) => ctrl.projectAnalytics(req as AuthRequest, res, next));
router.get('/analytics', (req, res, next) => ctrl.analytics(req as AuthRequest, res, next));
router.get('/trends', (req, res, next) => ctrl.trends(req as AuthRequest, res, next));

export default router;
