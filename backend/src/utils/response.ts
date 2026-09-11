import { Response } from 'express';
import type { ApiResponse, Paginated, PaginationMeta } from '@sms/shared';

/**
 * Global response helpers so every route returns the same ApiResponse<T>
 * envelope: { success, data, error }.
 */
export function ok<T>(res: Response, data: T, statusCode = 200): Response {
  const body: ApiResponse<T> = { success: true, data };
  return res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

export function paginated<T>(
  res: Response,
  items: T[],
  meta: PaginationMeta,
  statusCode = 200,
): Response {
  const payload: Paginated<T> = { items, meta };
  const body: ApiResponse<Paginated<T>> = { success: true, data: payload };
  return res.status(statusCode).json(body);
}

export function buildPaginationMeta(page: number, limit: number, total: number): PaginationMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
