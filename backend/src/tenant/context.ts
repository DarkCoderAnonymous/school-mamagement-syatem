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
  /** SchoolMembership this request acts through (ADR-001). Null for SUPER_ADMIN and system code. */
  membershipId?: string | null;
  role: Role | null;
  /** true when the caller is SUPER_ADMIN and is intentionally bypassing tenant scoping */
  isSuperAdmin: boolean;
  /**
   * true for trusted non-request code (seed scripts, migrations, boot-time
   * setup) that legitimately runs unscoped. Distinct from `isSuperAdmin` so
   * audit logs can tell "a human crossed tenants" from "a script ran".
   */
  isSystem?: boolean;
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

  /**
   * Runs `fn` as trusted system code with tenant scoping switched off.
   *
   * The plugin FAILS CLOSED: a tenant-scoped query with no context at all
   * throws rather than silently running unscoped. That protects the code
   * that matters (workers, services) but would also break the code that
   * legitimately has no tenant — the seed script, migrations, boot setup,
   * and tests asserting on raw collections. Those call this explicitly, so
   * "unscoped" is always a decision somebody wrote down rather than an
   * accident of missing context.
   *
   * Never call this from a request path. If you find yourself reaching for
   * it in a service, the tenant context is missing upstream — fix that.
   *
   * CAUTION: a Mongoose query is lazy. Returning `Model.find(...)` from `fn`
   * hands an unexecuted Query to the caller, which then runs it after this
   * scope has been popped — with no context, so it throws. Await inside `fn`
   * (or call `.exec()`) so the query runs while the scope is still active.
   */
  runAsSystem<T>(fn: () => T): T {
    return storage.run(
      { schoolId: null, userId: null, membershipId: null, role: null, isSuperAdmin: true, isSystem: true },
      fn,
    );
  },
};
