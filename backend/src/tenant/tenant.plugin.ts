import { Schema, Types } from 'mongoose';
import { TenantContext } from './context';

/**
 * Mongoose plugin applied to every tenant-owned schema.
 *
 * - On every read/update/delete query AND every aggregate() pipeline it
 *   injects `{ schoolId }` (as a filter or a leading $match stage) from the
 *   current AsyncLocalStorage tenant context, UNLESS the caller is
 *   SUPER_ADMIN (who is allowed to cross tenants).
 * - On every `save()` of a new document it stamps `schoolId` from context if
 *   not already set.
 * - SUPER_ADMIN bypasses are logged by the caller (service layer / audit
 *   middleware) — this plugin only refrains from forcing scoping for them;
 *   see src/middleware/audit.middleware.ts and modules that call
 *   auditSuperAdminBypass().
 *
 * NOTE: this plugin assumes every schema it's applied to defines a
 * `schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true }`
 * field itself (see backend/src/models/*.ts) — the plugin does not add the
 * field, it only enforces scoping around it.
 */
const SCOPED_QUERY_MIDDLEWARE = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndRemove',
  'countDocuments',
  'updateMany',
  'updateOne',
  'deleteMany',
  'deleteOne',
] as const;

export function tenantPlugin(schema: Schema): void {
  for (const op of SCOPED_QUERY_MIDDLEWARE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mongoose query middleware types don't unify cleanly across these ops
    schema.pre(op as any, function (this: any, next: (err?: Error) => void) {
      const ctx = TenantContext.get();

      // No tenant context at all (e.g. a script run outside a request, seed
      // script) — do not silently scope; caller is responsible.
      if (!ctx) return next();

      if (ctx.isSuperAdmin) {
        // SUPER_ADMIN bypasses scoping entirely. Auditing of the bypass is
        // the responsibility of the calling route/service (see
        // recordSuperAdminBypass in audit.middleware.ts) since the plugin
        // itself has no request/entity-name context to write a rich log.
        return next();
      }

      if (!ctx.schoolId) {
        // Authenticated non-super-admin with no schoolId is a misconfigured
        // token — fail closed rather than return cross-tenant data.
        return next(new Error('Tenant context missing schoolId for scoped query'));
      }

      // Force this tenant's schoolId rather than deferring to whatever the
      // caller put in the filter. Skipping injection when `schoolId` was
      // already present would let `find({ schoolId: <another school> })`
      // read across tenants — the one thing the plugin exists to prevent —
      // so an explicit value is overridden, not trusted. Overriding is safe
      // for honest callers too: passing your own schoolId is a no-op, and
      // SUPER_ADMIN (the only role allowed to cross schools) returned above.
      // getFilter() hands back the live query conditions, so assigning to it
      // replaces the caller's value outright — preferred over `where()`,
      // whose merge semantics around an already-present key are subtle.
      const filter = this.getFilter();
      filter.schoolId = new Types.ObjectId(ctx.schoolId);
      next();
    });
  }

  // Aggregation pipelines are NOT covered by the query middleware above —
  // Mongoose's aggregate() doesn't go through pre-find hooks. Every
  // dashboard/report aggregation on a tenant collection must therefore be
  // scoped here, or SUPER_ADMIN-only aggregates would otherwise leak
  // cross-school data to a regular school user. We unshift a $match stage
  // rather than appending, so later $group/$project stages only ever see
  // this school's documents.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Aggregate's `this` isn't generic over the schema, so there's no narrower type to use here
  schema.pre('aggregate', function (this: any, next: (err?: Error) => void) {
    const ctx = TenantContext.get();
    if (!ctx || ctx.isSuperAdmin) return next();

    if (!ctx.schoolId) {
      return next(new Error('Tenant context missing schoolId for scoped aggregate'));
    }

    const pipeline = this.pipeline();
    const alreadyScoped = pipeline.some(
      (stage: Record<string, unknown>) =>
        stage.$match && typeof stage.$match === 'object' && 'schoolId' in (stage.$match as object),
    );
    if (!alreadyScoped) {
      pipeline.unshift({ $match: { schoolId: new Types.ObjectId(ctx.schoolId) } });
    }
    next();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `this` is the document being saved, whose shape is only known to the schema this plugin is applied to
  schema.pre('save', function (this: any, next: (err?: Error) => void) {
    const ctx = TenantContext.get();
    if (!ctx) return next();

    // schoolId is required (non-nullable) on most tenant schemas, but a
    // handful (User, RefreshToken) explicitly allow null to support
    // platform-only SUPER_ADMIN accounts — see those models' overrides.
    const schoolIdIsRequired = Boolean(schema.path('schoolId')?.isRequired);

    if (this.isNew && !this.schoolId) {
      if (ctx.isSuperAdmin) {
        if (schoolIdIsRequired) {
          // SUPER_ADMIN must explicitly set schoolId when creating tenant
          // docs (e.g. register-school flow) — we don't guess it for them.
          return next(new Error('SUPER_ADMIN must explicitly set schoolId when creating tenant documents'));
        }
        // Nullable schema (e.g. a platform-only SUPER_ADMIN's own User /
        // RefreshToken) — leave schoolId as null, nothing to inject.
        return next();
      }
      if (!ctx.schoolId) {
        return next(new Error('Tenant context missing schoolId for document creation'));
      }
      this.schoolId = new Types.ObjectId(ctx.schoolId);
    }
    next();
  });
}
