import type { Model } from 'mongoose';
import { z } from 'zod';
import { AppError } from './AppError';
import { parsePaginationQuery } from './paginate';

/**
 * Case-insensitive "contains" match for a user-typed search box.
 *
 * The input is escaped: passed straight to RegExp, a search for "a+" or "("
 * either throws (500) or becomes a pattern the user never meant — and a
 * crafted one like "(a+)+$" is a catastrophic-backtracking DoS on the server.
 */
export function searchRegex(search: string): RegExp {
  return new RegExp(escapeRegex(search), 'i');
}

/** Whole-value, case-insensitive match — for "is this name already taken?" checks. */
export function exactRegex(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Keeps only sort fields a list endpoint actually indexes. `?sort=` is
 * user-controlled; sorting on an arbitrary field means an unindexed in-memory
 * sort over the whole collection, and on a nested path it can reveal the
 * ordering of fields the endpoint never returns.
 */
export function listSort(
  query: Record<string, unknown>,
  allowed: readonly string[],
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
  // parsePaginationQuery defaults an absent ?sort= to newest-first, which is
  // right for audit-style lists but wrong for, say, classes in grade order —
  // so the module's own default wins unless the caller actually asked.
  if (typeof query.sort !== 'string' || !query.sort.trim()) return fallback;
  return restrictSort(parsePaginationQuery(query).sort, allowed, fallback);
}

export function restrictSort(
  sort: Record<string, 1 | -1>,
  allowed: readonly string[],
  fallback: Record<string, 1 | -1>,
): Record<string, 1 | -1> {
  const kept = Object.fromEntries(Object.entries(sort).filter(([field]) => allowed.includes(field)));
  return Object.keys(kept).length > 0 ? (kept as Record<string, 1 | -1>) : fallback;
}

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const idParamsSchema = z.object({ id: objectId });

/** The query params every list endpoint accepts (CLAUDE.md). Extend per module for filters. */
export const listQueryBase = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.string().optional(),
  search: z.string().max(100).optional(),
};

/**
 * A referenced record must exist in THIS school. The tenant plugin also
 * refuses a cross-tenant reference on save, but as a generic 500; checking
 * here turns "that class isn't yours / doesn't exist" into a 400 on the field
 * the user can actually fix. The lookup is tenant-scoped, so another school's
 * id and a made-up id get the same answer.
 */
export async function assertExistsInSchool(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any tenant model; only _id/deletedAt are read
  model: Model<any>,
  id: unknown,
  label: string,
  field: string,
): Promise<void> {
  if (id === null || id === undefined || id === '') return;
  const exists = await model.exists({ _id: id, deletedAt: null });
  if (!exists) throw AppError.badRequest(`${label} not found`, { field });
}
