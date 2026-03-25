import { Request, Response, NextFunction } from 'express';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { notFoundError, forbiddenError, conflictError, badRequestError } from '../utils/errors';

const PROJECT_SELECT = {
  id: true, name: true, description: true, ownerId: true,
  isArchived: true, createdAt: true, updatedAt: true,
  _count: { select: { members: true, tasks: true } },
};

function formatProject(p: { _count: { members: number; tasks: number }; [key: string]: unknown }) {
  const { _count, ...rest } = p;
  return { ...rest, memberCount: _count.members, taskCount: _count.tasks };
}

// GET /api/projects
export async function listProjects(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const projects = await prisma.project.findMany({
      where: { members: { some: { userId: req.userId } } },
      select: PROJECT_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    res.json(projects.map(formatProject));
  } catch (err) {
    next(err);
  }
}

// POST /api/projects
export async function createProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, description } = req.body as { name: string; description?: string };
    const project = await prisma.project.create({
      data: {
        name,
        description,
        ownerId: req.userId,
        members: { create: { userId: req.userId, role: 'OWNER' } },
      },
      select: PROJECT_SELECT,
    });
    res.status(201).json(formatProject(project));
  } catch (err) {
    next(err);
  }
}

// GET /api/projects/:id
export async function getProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await requireMember(req.params.id, req.userId);
    const full = await prisma.project.findUnique({ where: { id: req.params.id }, select: PROJECT_SELECT });
    res.json(formatProject(full!));
  } catch (err) {
    next(err);
  }
}

// PUT /api/projects/:id
export async function updateProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await requireMember(req.params.id, req.userId);
    if (member.role === 'VIEWER' || member.role === 'MEMBER') throw forbiddenError();

    const { name, description, isArchived } = req.body as { name?: string; description?: string; isArchived?: boolean };
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { name, description, isArchived },
      select: PROJECT_SELECT,
    });
    res.json(formatProject(project));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/projects/:id
export async function deleteProject(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await requireMember(req.params.id, req.userId);
    if (member.role !== 'OWNER') throw forbiddenError('Only the project owner can delete a project.');
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ message: 'Project deleted.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/projects/:id/members
export async function listMembers(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMember(req.params.id, req.userId);
    const members = await prisma.projectMember.findMany({
      where: { projectId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });
    res.json(members);
  } catch (err) {
    next(err);
  }
}

// POST /api/projects/:id/members
export async function inviteMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = await requireMember(req.params.id, req.userId);
    if (actor.role === 'VIEWER' || actor.role === 'MEMBER') throw forbiddenError();

    const { email, role } = req.body as { email: string; role: 'ADMIN' | 'MEMBER' | 'VIEWER' };

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) throw badRequestError('No user found with this email.');

    const existing = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: req.params.id, userId: targetUser.id } },
    });
    if (existing) throw conflictError('User is already a member of this project.');

    const member = await prisma.projectMember.create({
      data: { projectId: req.params.id, userId: targetUser.id, role },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    res.status(201).json(member);
  } catch (err) {
    next(err);
  }
}

// PUT /api/projects/:id/members/:uid
export async function updateMemberRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = await requireMember(req.params.id, req.userId);
    if (actor.role !== 'OWNER') throw forbiddenError('Only the owner can change roles.');

    const { role } = req.body as { role: 'ADMIN' | 'MEMBER' | 'VIEWER' };
    const member = await prisma.projectMember.update({
      where: { projectId_userId: { projectId: req.params.id, userId: req.params.uid } },
      data: { role },
      include: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
    });
    res.json(member);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/projects/:id/members/:uid
export async function removeMember(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const actor = await requireMember(req.params.id, req.userId);
    if (actor.role === 'VIEWER' || actor.role === 'MEMBER') throw forbiddenError();
    if (req.params.uid === req.userId) throw badRequestError('You cannot remove yourself from the project.');

    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: req.params.id, userId: req.params.uid } },
    });
    res.json({ message: 'Member removed.' });
  } catch (err) {
    next(err);
  }
}

// ── helper ───────────────────────────────────────────────────────────────────

export async function requireMember(projectId: string, userId: string) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!member) throw notFoundError('Project');
  return member;
}
