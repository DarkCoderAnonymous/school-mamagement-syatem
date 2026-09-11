import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import type { ApiResponse } from '@sms/shared';
import { AppError } from '../utils/AppError';

function respond(res: Response, statusCode: number, code: string, message: string, details?: unknown): void {
  const body: ApiResponse<never> = { success: false, error: { code, message, details } };
  res.status(statusCode).json(body);
}

/** Maps every thrown error into the standard { success:false, error } envelope. */
// `_next` is unused but required: express only recognises a 4-arg function as an error handler.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    respond(res, err.statusCode, err.code, err.message, err.details);
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    respond(res, 400, 'BAD_REQUEST', `Invalid value for ${err.path}`);
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    respond(res, 400, 'VALIDATION_ERROR', err.message, err.errors);
    return;
  }

  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000) {
    const keyValue = (err as { keyValue?: unknown }).keyValue;
    respond(res, 409, 'CONFLICT', 'A record with this value already exists', keyValue);
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  respond(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}

export function notFoundHandler(req: Request, res: Response): void {
  respond(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
}
