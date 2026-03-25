import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import * as ctrl from '../controllers/projects.controller';
import * as taskCtrl from '../controllers/tasks.controller';

const router = Router();
router.use(authenticate);

router.get('/', (req, res, next) => ctrl.listProjects(req as AuthRequest, res, next));
router.post('/', (req, res, next) => ctrl.createProject(req as AuthRequest, res, next));
router.get('/:id', (req, res, next) => ctrl.getProject(req as AuthRequest, res, next));
router.put('/:id', (req, res, next) => ctrl.updateProject(req as AuthRequest, res, next));
router.delete('/:id', (req, res, next) => ctrl.deleteProject(req as AuthRequest, res, next));

router.get('/:id/members', (req, res, next) => ctrl.listMembers(req as AuthRequest, res, next));
router.post('/:id/members', (req, res, next) => ctrl.inviteMember(req as AuthRequest, res, next));
router.put('/:id/members/:uid', (req, res, next) => ctrl.updateMemberRole(req as AuthRequest, res, next));
router.delete('/:id/members/:uid', (req, res, next) => ctrl.removeMember(req as AuthRequest, res, next));

// Tasks nested under projects
router.get('/:pid/tasks', (req, res, next) => taskCtrl.listTasks(req as AuthRequest, res, next));
router.post('/:pid/tasks', (req, res, next) => taskCtrl.createTask(req as AuthRequest, res, next));

// Labels nested under projects
router.get('/:pid/labels', (req, res, next) => listLabels(req as AuthRequest, res, next));
router.post('/:pid/labels', (req, res, next) => createLabel(req as AuthRequest, res, next));

export default router;

// ── inline label handlers (simple enough not to need a separate file) ─────────

import { Response, NextFunction } from 'express';
import prisma from '../models/prisma';
import { notFoundError, forbiddenError } from '../utils/errors';
import { requireMember } from '../controllers/projects.controller';

async function listLabels(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMember(req.params.pid, req.userId);
    const labels = await prisma.label.findMany({ where: { projectId: req.params.pid } });
    res.json(labels);
  } catch (err) {
    next(err);
  }
}

async function createLabel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await requireMember(req.params.pid, req.userId);
    if (member.role === 'VIEWER' || member.role === 'MEMBER') throw forbiddenError();
    const { name, color } = req.body as { name: string; color: string };
    const label = await prisma.label.create({ data: { projectId: req.params.pid, name, color } });
    res.status(201).json(label);
  } catch (err) {
    next(err);
  }
}
