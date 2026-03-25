import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/comments.controller';

const router = Router();
router.use(authenticate);

router.put('/:id', (req, res, next) => ctrl.updateComment(req as AuthRequest, res, next));
router.delete('/:id', (req, res, next) => ctrl.deleteComment(req as AuthRequest, res, next));

export default router;
