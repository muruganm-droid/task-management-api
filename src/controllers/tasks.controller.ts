import { Request, Response, NextFunction } from 'express';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { requireMember } from './projects.controller';
import { notFoundError, forbiddenError, badRequestError } from '../utils/errors';
import { Prisma } from '@prisma/client';
type TaskStatus = string;
type Priority = string;
// Note: TaskStatus and Priority are stored as strings in DB, not enums

const TASK_INCLUDE = {
  assignees: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } },
  labels: { include: { label: true } },
  attachments: true,
  _count: { select: { subTasks: true, comments: true } },
} satisfies Prisma.TaskInclude;

function formatTask(task: Awaited<ReturnType<typeof prisma.task.findUnique>> & {
  assignees: { user: { id: string; name: string; avatarUrl: string | null } }[];
  labels: { label: { id: string; name: string; color: string; projectId: string } }[];
  _count: { subTasks: number; comments: number };
} | null) {
  if (!task) return null;
  const { assignees, labels, _count, ...rest } = task;
  return {
    ...rest,
    assignees: assignees.map((a) => a.user),
    labels: labels.map((tl) => tl.label),
    subTaskCount: _count.subTasks,
    commentCount: _count.comments,
    subTaskDoneCount: 0, // computed separately if needed
  };
}

// GET /api/projects/:pid/tasks
export async function listTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMember(req.params.pid, req.userId);

    const { status, priority, assigneeId, labelId, search, sortBy, sortOrder } = req.query as Record<string, string>;

    const where: Prisma.TaskWhereInput = {
      projectId: req.params.pid,
      status: status ? (status.split(',') as TaskStatus[]).reduce((acc, s) => ({ in: [...(acc.in ?? []), s as TaskStatus] }), {} as { in: TaskStatus[] }) : undefined,
      priority: priority ? { in: priority.split(',') as Priority[] } : undefined,
      assignees: assigneeId ? { some: { userId: assigneeId } } : undefined,
      labels: labelId ? { some: { labelId } } : undefined,
      OR: search
        ? [
            { title: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const orderBy: Prisma.TaskOrderByWithRelationInput =
      sortBy === 'priority'
        ? { priority: (sortOrder as 'asc' | 'desc') ?? 'desc' }
        : sortBy === 'dueDate'
        ? { dueDate: { sort: (sortOrder as 'asc' | 'desc') ?? 'asc', nulls: 'last' } }
        : { createdAt: (sortOrder as 'asc' | 'desc') ?? 'desc' };

    const tasks = await prisma.task.findMany({ where, include: TASK_INCLUDE, orderBy });

    // Enrich with subTaskDoneCount
    const enriched = await Promise.all(
      tasks.map(async (t) => {
        const doneCount = await prisma.subTask.count({ where: { taskId: t.id, isDone: true } });
        return { ...formatTask(t as Parameters<typeof formatTask>[0])!, subTaskDoneCount: doneCount };
      })
    );

    res.json(enriched);
  } catch (err) {
    next(err);
  }
}

// POST /api/projects/:pid/tasks
export async function createTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const member = await requireMember(req.params.pid, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    const { title, description, priority, dueDate, assigneeIds } = req.body as {
      title: string;
      description?: string;
      priority?: Priority;
      dueDate?: string;
      assigneeIds?: string[];
    };

    const task = await prisma.task.create({
      data: {
        projectId: req.params.pid,
        creatorId: req.userId,
        title,
        description,
        priority: priority ?? 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : undefined,
        assignees: assigneeIds?.length
          ? { create: assigneeIds.map((uid) => ({ userId: uid })) }
          : undefined,
      },
      include: TASK_INCLUDE,
    });

    // Notify assignees
    if (assigneeIds?.length) {
      await prisma.notification.createMany({
        data: assigneeIds
          .filter((uid) => uid !== req.userId)
          .map((uid) => ({
            userId: uid,
            type: 'TASK_ASSIGNED' as const,
            title: 'New task assigned',
            body: `You were assigned to: "${title}"`,
            link: `/tasks/${task.id}`,
          })),
      });
    }

    // Activity log
    await prisma.activityLog.create({
      data: { taskId: task.id, actorId: req.userId, action: 'created the task' },
    });

    res.status(201).json(formatTask(task as Parameters<typeof formatTask>[0]));
  } catch (err) {
    next(err);
  }
}

// GET /api/tasks/:id
export async function getTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id }, include: TASK_INCLUDE });
    if (!task) throw notFoundError('Task');
    await requireMember(task.projectId, req.userId);

    const doneCount = await prisma.subTask.count({ where: { taskId: task.id, isDone: true } });
    res.json({ ...formatTask(task as Parameters<typeof formatTask>[0])!, subTaskDoneCount: doneCount });
  } catch (err) {
    next(err);
  }
}

// PUT /api/tasks/:id
export async function updateTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const existing = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFoundError('Task');

    const member = await requireMember(existing.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    const { title, description, status, priority, dueDate } = req.body as Partial<{
      title: string; description: string; status: TaskStatus; priority: Priority; dueDate: string | null;
    }>;

    // Build activity entries for changed fields
    const changes: string[] = [];
    if (status && status !== existing.status) changes.push(`changed status to ${status}`);
    if (priority && priority !== existing.priority) changes.push(`changed priority to ${priority}`);
    if (dueDate !== undefined) changes.push('updated the due date');
    if (title && title !== existing.title) changes.push('renamed the task');

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        status,
        priority,
        dueDate: dueDate === null ? null : dueDate ? new Date(dueDate) : undefined,
      },
      include: TASK_INCLUDE,
    });

    if (changes.length) {
      await prisma.activityLog.createMany({
        data: changes.map((action) => ({ taskId: task.id, actorId: req.userId, action })),
      });
    }

    const doneCount = await prisma.subTask.count({ where: { taskId: task.id, isDone: true } });
    res.json({ ...formatTask(task as Parameters<typeof formatTask>[0])!, subTaskDoneCount: doneCount });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/tasks/:id
export async function deleteTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');

    const member = await requireMember(task.projectId, req.userId);
    const canDelete =
      member.role === 'OWNER' ||
      member.role === 'ADMIN' ||
      task.creatorId === req.userId;
    if (!canDelete) throw forbiddenError();

    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ message: 'Task deleted.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/tasks/:id/subtasks
export async function listSubTasks(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    await requireMember(task.projectId, req.userId);
    const subTasks = await prisma.subTask.findMany({ where: { taskId: req.params.id }, orderBy: { createdAt: 'asc' } });
    res.json(subTasks);
  } catch (err) {
    next(err);
  }
}

// POST /api/tasks/:id/subtasks
export async function createSubTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    const subTask = await prisma.subTask.create({
      data: { taskId: req.params.id, title: (req.body as { title: string }).title },
    });
    res.status(201).json(subTask);
  } catch (err) {
    next(err);
  }
}

// PUT /api/tasks/:id/subtasks/:sid
export async function updateSubTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    const { title, isDone } = req.body as { title?: string; isDone?: boolean };
    const subTask = await prisma.subTask.update({
      where: { id: req.params.sid },
      data: { title, isDone },
    });

    if (isDone !== undefined) {
      await prisma.activityLog.create({
        data: {
          taskId: req.params.id,
          actorId: req.userId,
          action: isDone ? `checked off "${subTask.title}"` : `unchecked "${subTask.title}"`,
        },
      });
    }
    res.json(subTask);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/tasks/:id/subtasks/:sid
export async function deleteSubTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();
    await prisma.subTask.delete({ where: { id: req.params.sid } });
    res.json({ message: 'Sub-task deleted.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/tasks/:id/comments
export async function listComments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    await requireMember(task.projectId, req.userId);
    const comments = await prisma.comment.findMany({
      where: { taskId: req.params.id },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json(comments);
  } catch (err) {
    next(err);
  }
}

// POST /api/tasks/:id/comments
export async function addComment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.id },
      include: { assignees: { select: { userId: true } } },
    });
    if (!task) throw notFoundError('Task');
    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    const comment = await prisma.comment.create({
      data: { taskId: req.params.id, authorId: req.userId, body: (req.body as { body: string }).body },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });

    // Notify assignees and creator (not the commenter themselves)
    const notifyUsers = new Set<string>([
      task.creatorId,
      ...task.assignees.map((a) => a.userId),
    ]);
    notifyUsers.delete(req.userId);

    if (notifyUsers.size > 0) {
      await prisma.notification.createMany({
        data: Array.from(notifyUsers).map((uid) => ({
          userId: uid,
          type: 'COMMENT_ADDED' as const,
          title: `New comment on "${task.title}"`,
          body: `${comment.author.name}: ${comment.body.slice(0, 80)}`,
          link: `/tasks/${task.id}`,
        })),
      });
    }

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
}

// GET /api/tasks/:id/activity
export async function listActivity(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    await requireMember(task.projectId, req.userId);
    const activity = await prisma.activityLog.findMany({
      where: { taskId: req.params.id },
      include: { actor: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(activity);
  } catch (err) {
    next(err);
  }
}

// POST /api/tasks/:id/labels
export async function attachLabels(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    const { labelIds } = req.body as { labelIds: string[] };
    await prisma.taskLabel.createMany({
      data: labelIds.map((lid) => ({ taskId: req.params.id, labelId: lid })),
      skipDuplicates: true,
    });
    res.json({ message: 'Labels attached.' });
  } catch (err) {
    next(err);
  }
}

// PUT /api/tasks/bulk-status
export async function bulkUpdateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { taskIds, status } = req.body as { taskIds: string[]; status: string };

    if (!taskIds?.length || !status) {
      throw badRequestError('taskIds and status are required');
    }

    // Verify all tasks exist and user has access
    const tasks = await prisma.task.findMany({ where: { id: { in: taskIds } } });
    if (tasks.length !== taskIds.length) throw notFoundError('One or more tasks');

    const projectIds = [...new Set(tasks.map((t) => t.projectId))];
    for (const pid of projectIds) {
      const member = await requireMember(pid, req.userId);
      if (member.role === 'VIEWER') throw forbiddenError();
    }

    await prisma.$transaction(
      taskIds.map((id) =>
        prisma.task.update({ where: { id }, data: { status } })
      )
    );

    // Activity log
    await prisma.activityLog.createMany({
      data: taskIds.map((id) => ({
        taskId: id,
        actorId: req.userId,
        action: `changed status to ${status}`,
      })),
    });

    res.json({ message: `${taskIds.length} tasks updated to ${status}` });
  } catch (err) {
    next(err);
  }
}

// PUT /api/tasks/reorder
export async function reorderTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { taskId, newStatus, newPosition } = req.body as {
      taskId: string;
      newStatus: string;
      newPosition: number;
    };

    if (!taskId || newPosition === undefined) {
      throw badRequestError('taskId and newPosition are required');
    }

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw notFoundError('Task');

    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    const targetStatus = newStatus ?? task.status;

    // Shift positions of tasks in the target column
    await prisma.task.updateMany({
      where: {
        projectId: task.projectId,
        status: targetStatus,
        position: { gte: newPosition },
        id: { not: taskId },
      },
      data: { position: { increment: 1 } },
    });

    const changes: string[] = [];
    if (targetStatus !== task.status) {
      changes.push(`changed status to ${targetStatus}`);
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: { status: targetStatus, position: newPosition },
      include: TASK_INCLUDE,
    });

    if (changes.length) {
      await prisma.activityLog.createMany({
        data: changes.map((action) => ({ taskId, actorId: req.userId, action })),
      });
    }

    const doneCount = await prisma.subTask.count({ where: { taskId, isDone: true } });
    res.json({ ...formatTask(updated as Parameters<typeof formatTask>[0])!, subTaskDoneCount: doneCount });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/tasks/:id/labels/:lid
export async function removeLabel(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();
    await prisma.taskLabel.delete({ where: { taskId_labelId: { taskId: req.params.id, labelId: req.params.lid } } });
    res.json({ message: 'Label removed.' });
  } catch (err) {
    next(err);
  }
}
