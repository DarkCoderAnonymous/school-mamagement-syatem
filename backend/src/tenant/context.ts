import { AsyncLocalStorage } from 'node:async_hooks';
import { Role } from '@sms/shared';

/**
 * Per-request tenant context. Populated by auth middleware right after a JWT
 * is verified, and read by the tenant Mongoose plugin at query/save time.
 *
 * We use AsyncLocalStorage instead of e.g. a global variable so that
 * concurrent requests never bleed schoolId into each other.
 */
export interface TenantContextValue {
  schoolId: string | null;
  userId: string | null;
  role: Role | null;
  /** true when the caller is SUPER_ADMIN and is intentionally bypassing tenant scoping */
  isSuperAdmin: boolean;
  /** IP address of the current request, used for audit logging of bypasses */
  ip?: string;
}

const storage = new AsyncLocalStorage<TenantContextValue>();

export const TenantContext = {
  run<T>(value: TenantContextValue, fn: () => T): T {
    return storage.run(value, fn);
  },
  get(): TenantContextValue | undefined {
    return storage.getStore();
  },
  getSchoolId(): string | null {
    return storage.getStore()?.schoolId ?? null;
  },
  isSuperAdmin(): boolean {
    return storage.getStore()?.isSuperAdmin ?? false;
  },
};
