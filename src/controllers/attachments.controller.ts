import { Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { requireMember } from './projects.controller';
import { notFoundError, forbiddenError, badRequestError } from '../utils/errors';

// POST /api/tasks/:id/attachments
export async function uploadAttachment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');

    const member = await requireMember(task.projectId, req.userId);
    if (member.role === 'VIEWER') throw forbiddenError();

    if (!req.file) throw badRequestError('No file uploaded');

    const attachment = await prisma.attachment.create({
      data: {
        taskId: task.id,
        uploaderId: req.userId,
        fileName: req.file.originalname,
        fileUrl: `/uploads/${req.file.filename}`,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });

    await prisma.activityLog.create({
      data: {
        taskId: task.id,
        actorId: req.userId,
        action: `attached "${req.file.originalname}"`,
      },
    });

    res.status(201).json(attachment);
  } catch (err) {
    next(err);
  }
}

// GET /api/tasks/:id/attachments
export async function listAttachments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await prisma.task.findUnique({ where: { id: req.params.id } });
    if (!task) throw notFoundError('Task');
    await requireMember(task.projectId, req.userId);

    const attachments = await prisma.attachment.findMany({
      where: { taskId: req.params.id },
      include: { uploader: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json(attachments);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/attachments/:aid
export async function deleteAttachment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.aid } });
    if (!attachment) throw notFoundError('Attachment');

    const task = await prisma.task.findUnique({ where: { id: attachment.taskId } });
    if (!task) throw notFoundError('Task');

    const member = await requireMember(task.projectId, req.userId);
    const canDelete =
      member.role === 'OWNER' ||
      member.role === 'ADMIN' ||
      attachment.uploaderId === req.userId;
    if (!canDelete) throw forbiddenError();

    // Delete the physical file
    const filePath = path.join(__dirname, '../../', attachment.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.attachment.delete({ where: { id: req.params.aid } });

    res.json({ message: 'Attachment deleted.' });
  } catch (err) {
    next(err);
  }
}

// GET /api/attachments/:aid/download
export async function downloadAttachment(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const attachment = await prisma.attachment.findUnique({ where: { id: req.params.aid } });
    if (!attachment) throw notFoundError('Attachment');

    const task = await prisma.task.findUnique({ where: { id: attachment.taskId } });
    if (!task) throw notFoundError('Task');
    await requireMember(task.projectId, req.userId);

    const filePath = path.join(__dirname, '../../', attachment.fileUrl);
    if (!fs.existsSync(filePath)) throw notFoundError('File');

    res.download(filePath, attachment.fileName);
  } catch (err) {
    next(err);
  }
}
