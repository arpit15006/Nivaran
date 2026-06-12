import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger.js';

// Consistent error envelope (PRD §9): { error: { code, message, details }, requestId }.
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new ApiError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Authentication required') => new ApiError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'You do not have access to this resource') => new ApiError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Resource not found') => new ApiError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string) => new ApiError(409, 'CONFLICT', msg);
export const tooMany = (msg = 'Too many requests') => new ApiError(429, 'RATE_LIMITED', msg);

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const requestId = res.getHeader('x-request-id') as string | undefined;

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.flatten() },
      requestId,
    });
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err, requestId }, 'API error');
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
      requestId,
    });
  }

  logger.error({ err, requestId }, 'Unhandled error');
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'An unexpected error occurred' },
    requestId,
  });
}

// Wrap async route handlers so rejections reach the error middleware.
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
}
