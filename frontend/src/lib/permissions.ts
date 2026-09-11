import { useAuthStore } from './auth-store';

/**
 * Permission checks read the `permissions` array the backend put on the JWT
 * (union of every role's permissions — see backend auth.service
 * resolveRolesAndPermissions). We check permission STRINGS, never role names,
 * so a school that invents a custom role gets correct UI for free.
 *
 * This governs visibility only. The backend re-checks every call with
 * requirePermission; hiding a button is a courtesy, not a security boundary.
 */
export function hasPermission(granted: string[] | undefined, required: string | string[]): boolean {
  if (!granted?.length) return false;
  const needed = Array.isArray(required) ? required : [required];
  if (!needed.length) return true;
  // "any of" rather than "all of": a nav group appears if the user can do at
  // least one thing inside it.
  return needed.some((p) => granted.includes(p));
}

export function hasEveryPermission(granted: string[] | undefined, required: string[]): boolean {
  if (!granted?.length) return false;
  return required.every((p) => granted.includes(p));
}

/** Hook form: `const can = usePermission(); can('student.create')`. */
export function usePermission(): (required: string | string[]) => boolean {
  const permissions = useAuthStore((s) => s.user?.permissions);
  return (required) => hasPermission(permissions, required);
}

export function usePermissions(): string[] {
  return useAuthStore((s) => s.user?.permissions) ?? [];
}
