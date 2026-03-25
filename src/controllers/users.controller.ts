import { Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { badRequestError, notFoundError } from '../utils/errors';

const USER_SELECT = {
  id: true, name: true, email: true, avatarUrl: true, bio: true, createdAt: true,
};

// GET /api/users/me
export async function getMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
    if (!user) throw notFoundError('User');
    res.json(user);
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me
export async function updateMe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, bio, avatarUrl } = req.body as { name?: string; bio?: string; avatarUrl?: string };
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: { name, bio, avatarUrl },
      select: USER_SELECT,
    });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

// PUT /api/users/me/password
export async function changePassword(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) throw notFoundError('User');

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw badRequestError('Current password is incorrect.');

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.userId }, data: { password: hashed } });

    res.json({ message: 'Password updated.' });
  } catch (err) {
    next(err);
  }
}
