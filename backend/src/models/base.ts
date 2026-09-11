import { Schema, SchemaDefinition, SchemaOptions } from 'mongoose';
import { tenantPlugin } from '../tenant/tenant.plugin';

/**
 * Fields added to every tenant-owned collection: schoolId (tenant scope),
 * deletedAt (soft delete). `timestamps: true` on the schema options adds
 * createdAt/updatedAt.
 */
export const tenantFields: SchemaDefinition = {
  schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true, index: true },
  deletedAt: { type: Date, default: null },
};

export const baseSchemaOptions: SchemaOptions = {
  timestamps: true,
};

/**
 * Build a Schema for a tenant-owned collection: merges in schoolId +
 * deletedAt, enables timestamps, and applies the tenant-scoping plugin.
 * Also adds a default query filter excluding soft-deleted docs unless the
 * caller explicitly asks for deletedAt via `.withDeleted()` style querying
 * is intentionally NOT auto-applied here (kept explicit in services) to
 * avoid surprising audit/reporting queries — see module services for
 * `deletedAt: null` usage.
 */
export function createTenantSchema<T extends SchemaDefinition>(definition: T, options: SchemaOptions = {}) {
  const schema = new Schema({ ...tenantFields, ...definition }, { ...baseSchemaOptions, ...options });
  schema.plugin(tenantPlugin);
  schema.index({ schoolId: 1, deletedAt: 1 });
  return schema;
}

/** Non-tenant (platform-level) schema: just timestamps, no schoolId/tenant plugin. */
export function createPlatformSchema<T extends SchemaDefinition>(definition: T, options: SchemaOptions = {}) {
  return new Schema({ ...definition, deletedAt: { type: Date, default: null } }, { ...baseSchemaOptions, ...options });
}
