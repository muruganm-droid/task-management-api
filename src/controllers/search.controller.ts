import { Response, NextFunction } from 'express';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { Prisma } from '@prisma/client';

// GET /api/search?q=...&type=tasks,projects&status=...&priority=...&assigneeId=...&dueBefore=...&dueAfter=...
export async function search(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { q, type, status, priority, assigneeId, dueBefore, dueAfter } = req.query as Record<string, string>;
    const types = type ? type.split(',') : ['tasks', 'projects'];

    // Get all projects the user is a member of
    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.userId },
      select: { projectId: true },
    });
    const projectIds = memberships.map((m) => m.projectId);

    // Also include owned projects
    const ownedProjects = await prisma.project.findMany({
      where: { ownerId: req.userId },
      select: { id: true },
    });
    const allProjectIds = [...new Set([...projectIds, ...ownedProjects.map((p) => p.id)])];

    const results: { tasks?: unknown[]; projects?: unknown[] } = {};

    if (types.includes('tasks')) {
      const where: Prisma.TaskWhereInput = {
        projectId: { in: allProjectIds },
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(status ? { status: { in: status.split(',') } } : {}),
        ...(priority ? { priority: { in: priority.split(',') } } : {}),
        ...(assigneeId ? { assignees: { some: { userId: assigneeId } } } : {}),
        ...(dueBefore || dueAfter
          ? {
              dueDate: {
                ...(dueBefore ? { lte: new Date(dueBefore) } : {}),
                ...(dueAfter ? { gte: new Date(dueAfter) } : {}),
              },
            }
          : {}),
      };

      const tasks = await prisma.task.findMany({
        where,
        include: {
          assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
          labels: { include: { label: true } },
          project: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      });

      results.tasks = tasks.map((t) => {
        const { assignees, labels, ...rest } = t;
        return {
          ...rest,
          assignees: assignees.map((a) => a.user),
          labels: labels.map((tl) => tl.label),
        };
      });
    }

    if (types.includes('projects')) {
      const where: Prisma.ProjectWhereInput = {
        id: { in: allProjectIds },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      };

      results.projects = await prisma.project.findMany({
        where,
        include: {
          _count: { select: { tasks: true, members: true } },
          owner: { select: { id: true, name: true, avatarUrl: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
    }

    res.json(results);
  } catch (err) {
    next(err);
  }
}
