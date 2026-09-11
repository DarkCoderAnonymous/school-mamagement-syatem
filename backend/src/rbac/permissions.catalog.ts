import { Permission } from '@sms/shared';

/**
 * Single source of truth for what a permission code means and which module
 * it belongs to. Seeded into the Permission collection on boot (see
 * ensurePermissionCatalog below) so admin UIs can list/describe permissions
 * without a code change — CLAUDE.md: "permissions in DB, not hard-coded."
 */
export interface PermissionCatalogEntry {
  code: string;
  module: string;
  description: string;
}

function module(code: string): string {
  return code.split('.')[0] as string;
}

const DESCRIPTIONS: Partial<Record<Permission, string>> = {
  [Permission.REGISTRATION_READ]: 'View school registration applications',
  [Permission.REGISTRATION_REVIEW]: 'Mark a registration as under review',
  [Permission.REGISTRATION_APPROVE]: 'Approve a registration and provision the school',
  [Permission.REGISTRATION_REJECT]: 'Reject a registration application',
  [Permission.PLAN_MANAGE]: 'Create/update the subscription plan catalogue',
  [Permission.SCHOOL_STATUS_UPDATE]: "Suspend or reactivate a school's account",
};

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = Object.values(Permission).map((code) => ({
  code,
  module: module(code),
  description: DESCRIPTIONS[code] ?? code,
}));
