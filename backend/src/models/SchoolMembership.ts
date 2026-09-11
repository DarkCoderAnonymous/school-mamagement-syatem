import { Schema, model, Types } from 'mongoose';
import { createTenantSchema } from './base';

/**
 * A person's relationship to ONE school (ADR-001) — this is where tenancy
 * now lives. Tenant-owned, so the scoping plugin applies to it exactly as it
 * does to students or classes: school A can never enumerate school B's staff.
 *
 * The domain links (`teacherId`, `guardianId`, `studentId`) are per-school by
 * construction, which is the point: a parent with children at two schools has
 * two memberships pointing at two different Guardian records.
 */
const schoolMembershipSchema = createTenantSchema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  roleIds: [{ type: Schema.Types.ObjectId, ref: 'Role', required: true }],
  /** School-level status. Account-wide disable lives on User.status. */
  status: { type: String, enum: ['INVITED', 'ACTIVE', 'DISABLED'], default: 'ACTIVE' },
  /** Optional campus restriction — narrowed explicitly in services (ADR-002). */
  campusIds: [{ type: Schema.Types.ObjectId, ref: 'Campus' }],
  teacherId: { type: Schema.Types.ObjectId, ref: 'Teacher', default: null },
  guardianId: { type: Schema.Types.ObjectId, ref: 'Guardian', default: null },
  studentId: { type: Schema.Types.ObjectId, ref: 'Student', default: null },
  /**
   * Permission epoch (ADR-005). Bumped whenever this membership's roles
   * change, or a role it holds is edited. A token minted with an older epoch
   * is rejected with TOKEN_STALE, which costs the user one silent refresh
   * rather than their session.
   */
  permissionsEpoch: { type: Number, required: true, default: 0 },
});

/**
 * One membership per person per school. Partial so soft-deleted rows don't
 * block re-adding someone who previously left (CLAUDE.md: unique indexes are
 * compound with schoolId and exclude soft-deleted records).
 */
schoolMembershipSchema.index(
  { userId: 1, schoolId: 1 },
  { unique: true, partialFilterExpression: { deletedAt: null } },
);
// "Which schools can this person act in?" — the login/switcher lookup.
schoolMembershipSchema.index({ userId: 1, status: 1, deletedAt: 1 });
// "Who works at this school?" — the staff list, scoped by the plugin.
schoolMembershipSchema.index({ schoolId: 1, status: 1, deletedAt: 1 });

export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DISABLED';

export interface SchoolMembershipDoc {
  _id: Types.ObjectId;
  schoolId: Types.ObjectId;
  userId: Types.ObjectId;
  roleIds: Types.ObjectId[];
  status: MembershipStatus;
  campusIds: Types.ObjectId[];
  teacherId?: Types.ObjectId | null;
  guardianId?: Types.ObjectId | null;
  studentId?: Types.ObjectId | null;
  permissionsEpoch: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const SchoolMembership = model<SchoolMembershipDoc>('SchoolMembership', schoolMembershipSchema);
