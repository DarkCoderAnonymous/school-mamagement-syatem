import argon2 from 'argon2';
import { availableParallelism } from 'node:os';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { AppError } from './AppError';

/**
 * argon2 is memory-hard on purpose — each hash or verify holds ~64 MB — and
 * login is public. Unbounded, a burst of parallel sign-in attempts (from many
 * IPs, so per-IP limits don't bite) would take the process's memory with it.
 * At most one operation per core runs at once; the rest wait their turn, and
 * past a queue that long the server sheds load with a 503 instead of falling
 * over. Normal sign-in traffic never comes near either bound.
 */
const MAX_CONCURRENT_HASHES = Math.max(2, availableParallelism());
const MAX_QUEUED_HASHES = 200;

let activeHashes = 0;
const waitingForSlot: (() => void)[] = [];

async function withHashSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeHashes < MAX_CONCURRENT_HASHES) {
    activeHashes += 1;
  } else {
    if (waitingForSlot.length >= MAX_QUEUED_HASHES) {
      throw new AppError(503, 'SERVER_BUSY', 'The server is busy — please try again in a moment');
    }
    // The finishing operation hands its slot straight over, so the count
    // never goes past the limit between one finishing and the next starting.
    await new Promise<void>((resolve) => waitingForSlot.push(resolve));
  }
  try {
    return await work();
  } finally {
    const next = waitingForSlot.shift();
    if (next) next();
    else activeHashes -= 1;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return withHashSlot(() => argon2.hash(plain));
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return withHashSlot(async () => {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  });
}

const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/** A readable, sufficiently random temporary password for a newly provisioned admin account. */
export function generateTempPassword(length = 12): string {
  // Dev convenience: one known password for every new account. Development
  // only — tests keep real random passwords, and env.ts refuses it in production.
  if (env.NODE_ENV === 'development' && env.DEV_TEMP_PASSWORD) return env.DEV_TEMP_PASSWORD;
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_ALPHABET[bytes[i]! % TEMP_PASSWORD_ALPHABET.length];
  }
  return out;
}
