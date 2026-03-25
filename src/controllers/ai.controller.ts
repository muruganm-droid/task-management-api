import { Response, NextFunction } from 'express';
import prisma from '../models/prisma';
import { AuthRequest } from '../middleware/authenticate';
import { requireMember } from './projects.controller';
import { badRequestError } from '../utils/errors';
import { parseTranscript, chatWithAI } from '../services/ai.service';

// POST /api/ai/parse-task
export async function parseTask(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { transcript, projectId } = req.body as { transcript?: string; projectId?: string };

    if (!transcript || !transcript.trim()) {
      throw badRequestError('Transcript is required');
    }
    if (!projectId) {
      throw badRequestError('Project ID is required');
    }

    await requireMember(projectId, req.userId);

    // Parse transcript with AI
    const parsed = await parseTranscript(transcript);

    // Resolve assignee names to user IDs from project members
    const resolvedAssignees: { id: string; name: string }[] = [];
    if (parsed.assigneeNames.length > 0) {
      const members = await prisma.projectMember.findMany({
        where: { projectId },
        include: { user: { select: { id: true, name: true } } },
      });

      for (const name of parsed.assigneeNames) {
        const match = members.find(
          (m) => m.user.name.toLowerCase().includes(name.toLowerCase())
        );
        if (match) {
          resolvedAssignees.push({ id: match.user.id, name: match.user.name });
        }
      }
    }

    res.json({
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      dueDate: parsed.dueDate,
      assignees: resolvedAssignees,
      rawAssigneeNames: parsed.assigneeNames,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/ai/chat
export async function chat(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { message, conversationHistory } = req.body as {
      message?: string;
      conversationHistory?: { role: string; content: string }[];
    };

    if (!message || !message.trim()) {
      throw badRequestError('Message is required');
    }

    const reply = await chatWithAI(message, conversationHistory ?? []);

    res.json({ reply });
  } catch (err) {
    next(err);
  }
}
