import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/tasks.controller';

const router = Router();
router.use(authenticate);

router.put('/bulk-status', (req, res, next) => ctrl.bulkUpdateStatus(req as AuthRequest, res, next));
router.put('/reorder', (req, res, next) => ctrl.reorderTask(req as AuthRequest, res, next));

router.get('/:id', (req, res, next) => ctrl.getTask(req as AuthRequest, res, next));
router.put('/:id', (req, res, next) => ctrl.updateTask(req as AuthRequest, res, next));
router.delete('/:id', (req, res, next) => ctrl.deleteTask(req as AuthRequest, res, next));

router.get('/:id/subtasks', (req, res, next) => ctrl.listSubTasks(req as AuthRequest, res, next));
router.post('/:id/subtasks', (req, res, next) => ctrl.createSubTask(req as AuthRequest, res, next));
router.put('/:id/subtasks/:sid', (req, res, next) => ctrl.updateSubTask(req as AuthRequest, res, next));
router.delete('/:id/subtasks/:sid', (req, res, next) => ctrl.deleteSubTask(req as AuthRequest, res, next));

router.get('/:id/comments', (req, res, next) => ctrl.listComments(req as AuthRequest, res, next));
router.post('/:id/comments', (req, res, next) => ctrl.addComment(req as AuthRequest, res, next));

router.get('/:id/activity', (req, res, next) => ctrl.listActivity(req as AuthRequest, res, next));

router.post('/:id/labels', (req, res, next) => ctrl.attachLabels(req as AuthRequest, res, next));
router.delete('/:id/labels/:lid', (req, res, next) => ctrl.removeLabel(req as AuthRequest, res, next));

export default router;
