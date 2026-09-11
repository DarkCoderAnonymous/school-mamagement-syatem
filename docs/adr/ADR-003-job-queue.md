# ADR-003 — Job queue and tenant context in workers

- **Status:** Accepted
- **Date:** 2026-09-12

## Context

Imports, PDF generation, payroll runs, invoice cycles, SMS and email all run
outside the request. The tenant plugin reads `schoolId` from
`AsyncLocalStorage`, which is populated by the auth middleware — and a worker
has no request, so it has no context. A tenant-scoped query in a worker would
otherwise run **unscoped**.

## Decision

**BullMQ on Redis**, already a dependency (`jobs/mailer.queue.ts` is the
existing example).

Every job payload carries `schoolId` and `actorUserId` explicitly. No job
infers its tenant from anything ambient.

Workers do not touch the database directly. They run their handler inside the
tenant context:

```ts
await runJobWithTenantContext(job.data, async () => {
  // everything here is scoped exactly as a request would be
});
```

`runJobWithTenantContext` calls `TenantContext.run(...)` with the payload's
`schoolId` and `isSuperAdmin: false`, so a worker has strictly less authority
than the user who queued it.

**The plugin fails closed** (ADR/Phase 2): a tenant-scoped query with no
context throws rather than running unscoped. A worker that forgets the wrapper
fails loudly on its first query instead of quietly reading every school.

## Consequences

Job payloads must stay small and must not carry the tenant's data, only its
id — the payload sits in Redis, which is not tenant-partitioned.

Failing closed means any existing unscoped script (seed, migrations) must
either declare a super-admin context explicitly or run before the plugin
matters. That is the intended trade: scripts are few and reviewed; workers
are many and easy to get wrong.

Retries must be idempotent, because BullMQ retries on failure. Jobs that write
money or marks carry an idempotency key.
