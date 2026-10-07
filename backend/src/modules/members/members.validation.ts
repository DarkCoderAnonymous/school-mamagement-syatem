import { z } from 'zod';
import { listQueryBase, objectId } from '../../utils/query';

const roleIds = z.array(objectId).min(1, 'Pick at least one role').max(10);

export const inviteMemberSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().email('Enter a valid email address').max(254),
  phone: z.string().trim().max(30).optional(),
  roleIds,
});

export const updateMemberRolesSchema = z.object({ roleIds });
export const updateMemberStatusSchema = z.object({ status: z.enum(['ACTIVE', 'DISABLED']) });

export const listMembersQuerySchema = z.object({
  ...listQueryBase,
  /** `staff` (default) hides parent/student accounts, which belong to their own screens. */
  scope: z.enum(['staff', 'all']).default('staff'),
  roleId: objectId.optional(),
  status: z.enum(['INVITED', 'ACTIVE', 'DISABLED']).optional(),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
