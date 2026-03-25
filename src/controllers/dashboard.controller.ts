import { Response, NextFunction } from 'express';
import { subDays, startOfDay, format } from 'date-fns';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { requireMember } from './projects.controller';

// GET /api/dashboard/my-tasks
export async function myTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const tasks = await prisma.task.findMany({
      where: {
        assignees: { some: { userId: req.userId } },
        status: { not: 'ARCHIVED' },
      },
      include: {
        assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
        labels: { include: { label: true } },
        _count: { select: { subTasks: true, comments: true } },
      },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
    });

    const formatted = tasks.map((t) => {
      const { assignees, labels, _count, ...rest } = t;
      return {
        ...rest,
        assignees: assignees.map((a) => a.user),
        labels: labels.map((tl) => tl.label),
        subTaskCount: _count.subTasks,
        commentCount: _count.comments,
        subTaskDoneCount: 0,
      };
    });

    res.json(formatted);
  } catch (err) {
    next(err);
  }
}

// GET /api/dashboard/projects/:pid
export async function projectAnalytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMember(req.params.pid, req.userId);

    const [tasks, members] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: req.params.pid },
        include: { assignees: { select: { userId: true } } },
      }),
      prisma.projectMember.findMany({
        where: { projectId: req.params.pid },
        include: { user: { select: { id: true, name: true } } },
      }),
    ]);

    const now = new Date();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && t.dueDate < now && t.status !== 'DONE'
    ).length;

    const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});

    const tasksByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    const tasksByAssignee = members.map((m) => {
      const memberTasks = tasks.filter((t) => t.assignees.some((a) => a.userId === m.userId));
      return {
        userId: m.userId,
        name: m.user.name,
        total: memberTasks.length,
        done: memberTasks.filter((t) => t.status === 'DONE').length,
      };
    });

    res.json({ totalTasks, completedTasks, inProgressTasks, overdueTasks, tasksByStatus, tasksByAssignee });
  } catch (err) {
    next(err);
  }
}

// GET /api/dashboard/analytics
export async function analytics(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    // Get all projects the user is a member of
    const memberships = await prisma.projectMember.findMany({
      where: { userId: req.userId },
      select: { projectId: true },
    });
    const ownedProjects = await prisma.project.findMany({
      where: { ownerId: req.userId },
      select: { id: true },
    });
    const allProjectIds = [...new Set([
      ...memberships.map((m) => m.projectId),
      ...ownedProjects.map((p) => p.id),
    ])];

    const tasks = await prisma.task.findMany({
      where: { projectId: { in: allProjectIds } },
      include: { assignees: { select: { userId: true } } },
    });

    const now = new Date();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate < now && t.status !== 'DONE').length;

    // Tasks by priority
    const priorityCounts = tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.priority] = (acc[t.priority] ?? 0) + 1;
      return acc;
    }, {});
    const tasksByPriority = Object.entries(priorityCounts).map(([priority, count]) => ({ priority, count }));

    // Tasks by status
    const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
      acc[t.status] = (acc[t.status] ?? 0) + 1;
      return acc;
    }, {});
    const tasksByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    // Average completion time (days from created to last status change to DONE)
    const doneTasks = tasks.filter((t) => t.status === 'DONE');
    let avgCompletionDays = 0;
    if (doneTasks.length > 0) {
      const totalDays = doneTasks.reduce((sum, t) => {
        const diff = (t.updatedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        return sum + diff;
      }, 0);
      avgCompletionDays = Math.round((totalDays / doneTasks.length) * 10) / 10;
    }

    // Team workload — tasks per member across all projects
    const members = await prisma.projectMember.findMany({
      where: { projectId: { in: allProjectIds } },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });
    const uniqueMembers = new Map<string, { id: string; name: string; avatarUrl: string | null }>();
    members.forEach((m) => uniqueMembers.set(m.userId, m.user));

    const teamWorkload = Array.from(uniqueMembers.entries()).map(([userId, user]) => {
      const memberTasks = tasks.filter((t) => t.assignees.some((a) => a.userId === userId));
      return {
        userId,
        name: user.name,
        avatarUrl: user.avatarUrl,
        total: memberTasks.length,
        done: memberTasks.filter((t) => t.status === 'DONE').length,
        inProgress: memberTasks.filter((t) => t.status === 'IN_PROGRESS').length,
      };
    });

    // Weekly created vs completed (last 4 weeks)
    const weeklyStats = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = subDays(startOfDay(new Date()), (i + 1) * 7);
      const weekEnd = subDays(startOfDay(new Date()), i * 7);
      const created = tasks.filter((t) => t.createdAt >= weekStart && t.createdAt < weekEnd).length;
      const completed = doneTasks.filter((t) => t.updatedAt >= weekStart && t.updatedAt < weekEnd).length;
      weeklyStats.push({
        weekStart: format(weekStart, 'yyyy-MM-dd'),
        weekEnd: format(weekEnd, 'yyyy-MM-dd'),
        created,
        completed,
      });
    }

    res.json({
      completionRate,
      totalTasks,
      completedTasks,
      overdueTasks,
      avgCompletionDays,
      tasksByPriority,
      tasksByStatus,
      teamWorkload,
      weeklyStats,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/dashboard/trends
export async function trends(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = 30;
    const since = startOfDay(subDays(new Date(), days - 1));

    const completed = await prisma.activityLog.findMany({
      where: {
        action: 'changed status to DONE',
        createdAt: { gte: since },
        task: { assignees: { some: { userId: req.userId } } },
      },
      select: { createdAt: true },
    });

    // Group by day
    const counts: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = format(subDays(new Date(), days - 1 - i), 'yyyy-MM-dd');
      counts[d] = 0;
    }
    completed.forEach((entry) => {
      const d = format(entry.createdAt, 'yyyy-MM-dd');
      if (d in counts) counts[d]++;
    });

    res.json(Object.entries(counts).map(([date, count]) => ({ date, count })));
  } catch (err) {
    next(err);
  }
}
