import { Response, NextFunction } from 'express';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { notFoundError, forbiddenError } from '../utils/errors';

// PUT /api/comments/:id
export async function updateComment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) throw notFoundError('Comment');
    if (comment.authorId !== req.userId) throw forbiddenError('You can only edit your own comments.');

    const updated = await prisma.comment.update({
      where: { id: req.params.id },
      data: { body: (req.body as { body: string }).body },
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/comments/:id
export async function deleteComment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const comment = await prisma.comment.findUnique({ where: { id: req.params.id } });
    if (!comment) throw notFoundError('Comment');
    if (comment.authorId !== req.userId) throw forbiddenError('You can only delete your own comments.');
    await prisma.comment.delete({ where: { id: req.params.id } });
    res.json({ message: 'Comment deleted.' });
  } catch (err) {
    next(err);
  }
}
