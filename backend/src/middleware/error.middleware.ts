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

  // Field names only, never values: Mongoose's messages and `err.errors`
  // echo the rejected value and schema internals back to the caller. The
  // shape matches Zod's (`fieldErrors`) so forms can still point at the field.
  if (err instanceof mongoose.Error.ValidationError) {
    const fieldErrors = Object.fromEntries(Object.keys(err.errors).map((path) => [path, ['Invalid value']]));
    respond(res, 400, 'VALIDATION_ERROR', 'Validation failed', { fieldErrors });
    return;
  }

  // Which field clashed, not the value it clashed on (that would confirm,
  // say, that an email is registered). `schoolId` leads most compound keys
  // and is never what the user can fix.
  if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === 11000) {
    const keyValue = (err as { keyValue?: Record<string, unknown> }).keyValue ?? {};
    const field = Object.keys(keyValue).find((k) => k !== 'schoolId');
    respond(res, 409, 'CONFLICT', 'A record with this value already exists', field ? { field } : undefined);
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[unhandled error]', err);
  respond(res, 500, 'INTERNAL_ERROR', 'Internal server error');
}

export function notFoundHandler(req: Request, res: Response): void {
  respond(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`);
}
