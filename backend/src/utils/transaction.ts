import mongoose, { type ClientSession } from 'mongoose';

/**
 * Runs `fn` in a MongoDB transaction and returns its result (CLAUDE.md:
 * multi-document writes that must be atomic use transactions).
 *
 * The driver may RETRY `fn` on a transient error, so it must have no side
 * effects outside the database — send mail and similar after this resolves.
 */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    let ran = false;
    await session.withTransaction(async () => {
      result = await fn(session);
      ran = true;
    });
    if (!ran) throw new Error('Transaction completed without running');
    return result as T;
  } finally {
    await session.endSession();
  }
}
