import type { ClientSession } from 'mongoose';
import { Counter } from '../models/Counter';
import { AppError } from '../utils/AppError';

export interface SequenceFormat {
  /** Literal prefix, e.g. 'ADM' → "ADM-2026-0007". */
  prefix?: string;
  /** Zero-padded width of the numeric part. Default 4. */
  padding?: number;
  /** Inserted between prefix and number, e.g. the session year. */
  segment?: string;
  /** Separator between parts. Default '-'. */
  separator?: string;
}

/**
 * Issues the next number in a per-school series, atomically.
 *
 * Admission numbers, invoice numbers and receipt numbers must never collide
 * or skip visibly, and two concurrent admissions are entirely normal at
 * enrolment time. Reading a max and adding one is a race: both requests read
 * the same value and both write the same number. A single `findOneAndUpdate`
 * with `$inc` is resolved by the server under a document-level lock, so
 * concurrent callers are serialised and each gets a distinct value.
 *
 * The counter is tenant-scoped, so school A's invoice 1 and school B's
 * invoice 1 coexist — the plugin scopes the filter, and the `$setOnInsert`
 * it adds on upsert stamps schoolId on the row that gets created first.
 *
 * Pass the surrounding `session` when issuing inside a transaction (creating
 * a student, recording a payment) so a rolled-back write doesn't burn a
 * number — and note the counter row itself participates in that transaction.
 */
export async function nextSequenceValue(key: string, session?: ClientSession): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      // Without this, a concurrent upsert on the same (schoolId, key) can
      // surface as a duplicate-key error instead of an increment.
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    },
  );

  if (!counter) throw AppError.internal(`Failed to issue a number for series "${key}"`);
  return counter.seq;
}

/** Formats an issued number, e.g. `ADM-2026-0007`. */
export function formatSequence(value: number, format: SequenceFormat = {}): string {
  const { prefix, segment, padding = 4, separator = '-' } = format;
  const number = String(value).padStart(padding, '0');
  return [prefix, segment, number].filter(Boolean).join(separator);
}

/** Issue and format in one step — what callers normally want. */
export async function nextSequence(
  key: string,
  format: SequenceFormat = {},
  session?: ClientSession,
): Promise<string> {
  return formatSequence(await nextSequenceValue(key, session), format);
}

/**
 * Current value without consuming one — for "your next invoice will be…"
 * previews. Never use this to compute a number you then save: that's the
 * read-then-write race the increment exists to avoid.
 */
export async function peekSequenceValue(key: string): Promise<number> {
  const counter = await Counter.findOne({ key }).lean();
  return counter?.seq ?? 0;
}
