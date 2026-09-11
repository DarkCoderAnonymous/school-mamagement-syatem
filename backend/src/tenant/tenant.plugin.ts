import { Schema, Types } from 'mongoose';
import { TenantContext } from './context';

/**
 * Mongoose plugin applied to every tenant-owned schema.
 *
 * - On every read/update/delete query AND every aggregate() pipeline it
 *   injects `{ schoolId }` (as a filter or a leading $match stage) from the
 *   current AsyncLocalStorage tenant context, UNLESS the caller is
 *   SUPER_ADMIN (who is allowed to cross tenants).
 * - On every `save()` / `insertMany()` of a new document it stamps
 *   `schoolId` from context if not already set.
 * - It FAILS CLOSED: a tenant-scoped operation with no context at all throws
 *   instead of running unscoped. Trusted non-request code (seed, migrations,
 *   tests, jobs) opts out explicitly via `TenantContext.runAsSystem()`.
 * - SUPER_ADMIN bypasses are logged by the caller (service layer / audit
 *   middleware) — this plugin only refrains from forcing scoping for them.
 *
 * NOTE: this plugin assumes every schema it's applied to defines a
 * `schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true }`
 * field itself (see backend/src/models/*.ts) — the plugin does not add the
 * field, it only enforces scoping around it.
 */

/**
 * Every Mongoose query middleware hook that can carry a filter. `distinct`,
 * `replaceOne` and `findOneAndReplace` are here because they were previously
 * missing: `Model.distinct('email')` on a tenant collection would happily
 * return every school's values.
 */
const SCOPED_QUERY_MIDDLEWARE = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndRemove',
  'findOneAndReplace',
  'replaceOne',
  'countDocuments',
  'distinct',
  'updateMany',
  'updateOne',
  'deleteMany',
  'deleteOne',
] as const;

/** Thrown rather than returning data, so a missing context can never leak. */
function noContextError(operation: string): Error {
  return new Error(
    `Tenant context missing for "${operation}" on a tenant-scoped collection. ` +
      'Requests get context from auth middleware; jobs and scripts must wrap the ' +
      'call in TenantContext.runAsSystem() or run with an explicit tenant context.',
  );
}

/**
 * Resolves what scoping to apply, or an error to fail with.
 * `null` scope means "no scoping needed" (super admin or system code).
 */
function resolveScope(operation: string): { error?: Error; schoolId?: Types.ObjectId } {
  const ctx = TenantContext.get();

  if (!ctx) return { error: noContextError(operation) };
  if (ctx.isSuperAdmin) return {};

  if (!ctx.schoolId) {
    // Authenticated non-super-admin with no schoolId is a misconfigured
    // token — fail closed rather than return cross-tenant data.
    return { error: new Error(`Tenant context missing schoolId for "${operation}"`) };
  }

  return { schoolId: new Types.ObjectId(ctx.schoolId) };
}

export function tenantPlugin(schema: Schema): void {
  for (const op of SCOPED_QUERY_MIDDLEWARE) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mongoose query middleware types don't unify cleanly across these ops
    schema.pre(op as any, function (this: any, next: (err?: Error) => void) {
      const { error, schoolId } = resolveScope(op);
      if (error) return next(error);
      if (!schoolId) return next();

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
      filter.schoolId = schoolId;

      // An upsert that misses must CREATE inside this tenant, not without a
      // schoolId — the filter alone doesn't reach the inserted document.
      const options = typeof this.getOptions === 'function' ? this.getOptions() : undefined;
      if (options?.upsert) {
        const update = this.getUpdate();
        if (update && !Array.isArray(update)) {
          update.$setOnInsert = { ...(update.$setOnInsert ?? {}), schoolId };
        }
      }

      next();
    });
  }

  /**
   * `estimatedDocumentCount` reads collection metadata and takes no filter,
   * so it cannot be scoped — it would report every school's row count.
   * Blocked outright; callers want countDocuments().
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  schema.pre('estimatedDocumentCount' as any, function (next: (err?: Error) => void) {
    const ctx = TenantContext.get();
    if (ctx?.isSuperAdmin) return next();
    next(
      new Error(
        'estimatedDocumentCount() cannot be tenant-scoped (it takes no filter). Use countDocuments().',
      ),
    );
  });

  /**
   * Aggregation pipelines are NOT covered by the query middleware above —
   * Mongoose's aggregate() doesn't go through pre-find hooks. Every
   * dashboard/report aggregation on a tenant collection must therefore be
   * scoped here, or it would leak cross-school data. We unshift a $match
   * stage rather than appending, so later $group/$project stages only ever
   * see this school's documents.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Aggregate's `this` isn't generic over the schema, so there's no narrower type to use here
  schema.pre('aggregate', function (this: any, next: (err?: Error) => void) {
    const { error, schoolId } = resolveScope('aggregate');
    if (error) return next(error);
    if (!schoolId) return next();

    const pipeline = this.pipeline();
    const alreadyScoped = pipeline.some(
      (stage: Record<string, unknown>) =>
        stage.$match && typeof stage.$match === 'object' && 'schoolId' in (stage.$match as object),
    );
    if (!alreadyScoped) {
      pipeline.unshift({ $match: { schoolId } });
    }

    /**
     * $lookup joins ANOTHER collection, so the outer $match above does not
     * constrain it: a pipeline joining `students` from a school's `classes`
     * would pull every school's students into the result. Mongoose has no
     * hook on the joined collection, so we scope the join here.
     *
     * Pipeline-form $lookup gets a $match prepended to its sub-pipeline.
     * localField/foreignField form has nowhere to put a condition at all, so
     * it is REJECTED against tenant collections — the caller must rewrite it
     * in pipeline form. Failing loudly beats joining silently.
     */
    for (const stage of pipeline as Record<string, unknown>[]) {
      const lookup = stage.$lookup as
        | { from?: string; pipeline?: unknown[]; localField?: string; foreignField?: string }
        | undefined;
      if (!lookup?.from) continue;
      if (!isTenantCollection(lookup.from)) continue;

      if (lookup.pipeline) {
        lookup.pipeline.unshift({ $match: { schoolId } });
      } else if (lookup.localField || lookup.foreignField) {
        return next(
          new Error(
            `$lookup into tenant collection "${lookup.from}" uses localField/foreignField, which cannot be ` +
              'tenant-scoped. Rewrite it in pipeline form so the join can carry its own $match on schoolId.',
          ),
        );
      }
    }

    next();
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- `this` is the document being saved, whose shape is only known to the schema this plugin is applied to
  schema.pre('save', function (this: any, next: (err?: Error) => void) {
    const ctx = TenantContext.get();
    if (!ctx) return next(noContextError('save'));

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

  /**
   * insertMany() bypasses document middleware entirely, so without this hook
   * a bulk insert would write rows with no schoolId at all.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- docs are raw objects here, shape known only to the schema
  schema.pre('insertMany', function (next: (err?: Error) => void, docs: any[]) {
    const ctx = TenantContext.get();
    if (!ctx) return next(noContextError('insertMany'));
    if (ctx.isSuperAdmin) return next();
    if (!ctx.schoolId) return next(new Error('Tenant context missing schoolId for insertMany'));

    const schoolId = new Types.ObjectId(ctx.schoolId);
    for (const doc of docs ?? []) doc.schoolId = schoolId;
    next();
  });

  /**
   * bulkWrite() takes raw driver operations that never reach query or
   * document middleware. Scoping each operation's filter here would mean
   * re-implementing the driver's operation grammar, and a miss would be a
   * silent cross-tenant write — so it is blocked instead. Callers use the
   * scoped operations above, or wrap a deliberate bulk write in
   * TenantContext.runAsSystem() with explicit schoolId filters.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
  schema.pre('bulkWrite' as any, function (next: (err?: Error) => void) {
    const ctx = TenantContext.get();
    if (ctx?.isSuperAdmin) return next();
    next(
      new Error(
        'bulkWrite() is not tenant-scoped and is blocked on tenant collections. Use the scoped ' +
          'update/delete helpers, or TenantContext.runAsSystem() with explicit schoolId filters.',
      ),
    );
  });
}

/**
 * Mongoose pluralises model names for collections, so this is the collection
 * name as it appears in `$lookup.from`. Kept as an explicit list rather than
 * inspecting the connection's registered models, because the plugin runs at
 * schema-build time when later models may not be registered yet.
 */
const TENANT_COLLECTIONS = new Set([
  'schoolmemberships',
  'refreshtokens',
  'academicsessions',
  'campuses',
  'classes',
  'sections',
  'subjects',
  'students',
  'guardians',
  'teachers',
  'employees',
  'notifications',
  'fileuploads',
]);

export function isTenantCollection(collectionName: string): boolean {
  return TENANT_COLLECTIONS.has(collectionName.toLowerCase());
}
