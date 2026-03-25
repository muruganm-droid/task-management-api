import { Response, NextFunction } from 'express';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';

// GET /api/notifications
export async function listNotifications(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    next(err);
  }
}

// PUT /api/notifications/:id/read
export async function markRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.userId },
      data: { isRead: true },
    });
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    next(err);
  }
}

// PUT /api/notifications/read-all
export async function markAllRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    next(err);
  }
}
