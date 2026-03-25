export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export const notFoundError = (resource = 'Resource') =>
  new AppError(`${resource} not found`, 404, 'NOT_FOUND');

export const unauthorizedError = (message = 'Unauthorized') =>
  new AppError(message, 401, 'UNAUTHORIZED');

export const forbiddenError = (message = 'Forbidden') =>
  new AppError(message, 403, 'FORBIDDEN');

export const badRequestError = (message: string) =>
  new AppError(message, 400, 'BAD_REQUEST');

export const conflictError = (message: string) =>
  new AppError(message, 409, 'CONFLICT');
