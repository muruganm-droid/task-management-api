import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt';
import { unauthorizedError } from '../utils/errors';

export interface AuthRequest extends Request {
  userId: string;
  userEmail: string;
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorizedError('No token provided'));
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    (req as AuthRequest).userId = payload.userId;
    (req as AuthRequest).userEmail = payload.email;
    next();
  } catch {
    next(unauthorizedError('Invalid or expired token'));
  }
}
