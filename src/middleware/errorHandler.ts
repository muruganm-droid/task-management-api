import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ message: err.message, code: err.code });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      message: 'Validation error',
      errors: err.flatten().fieldErrors,
    });
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  console.error('Unhandled error:', error.message, error.stack);
  res.status(500).json({ message: 'Internal server error', debug: error.message });
}
