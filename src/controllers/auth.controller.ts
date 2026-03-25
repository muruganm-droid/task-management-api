import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../models/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { AppError, conflictError, unauthorizedError, badRequestError } from '../utils/errors';

const BCRYPT_ROUNDS = 12;

// POST /api/auth/register
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, email, password } = req.body as { name: string; email: string; password: string };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw conflictError('An account with this email already exists.');

    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { name, email, password: hashed },
      select: { id: true, name: true, email: true, avatarUrl: true, bio: true, createdAt: true },
    });

    const tokens = await issueTokens(user.id, user.email);
    res.status(201).json({ user, tokens });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/login
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw unauthorizedError('Invalid email or password.');

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) throw unauthorizedError('Invalid email or password.');

    const { password: _, ...safeUser } = user;
    const tokens = await issueTokens(user.id, user.email);
    res.json({ user: safeUser, tokens });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/logout
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/refresh
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) throw unauthorizedError('Refresh token required.');

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) throw unauthorizedError('Invalid refresh token.');

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw unauthorizedError('Invalid refresh token.');
    }

    // Rotate token
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    const tokens = await issueTokens(payload.userId, payload.email);
    res.json({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/forgot-password  (stub — logs token; wire up SMTP for real use)
export async function forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body as { email: string };
    // Always respond generically to prevent user enumeration
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // In production: generate a short-lived reset token, store it, and email it
      const resetToken = uuidv4();
      console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reset-password  (stub)
export async function resetPassword(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // TODO: Validate reset token from DB and update password
    res.json({ message: 'Password reset successful.' });
  } catch (err) {
    next(err);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function issueTokens(userId: string, email: string) {
  const accessToken = signAccessToken({ userId, email });
  const refreshToken = signRefreshToken({ userId, email });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({ data: { token: refreshToken, userId, expiresAt } });

  return { accessToken, refreshToken };
}
