'use client';

import type { ReactNode } from 'react';
import { usePermission } from '@/lib/permissions';

/**
 * Renders children only when the user holds at least one of `permission`.
 *
 * Use this for things the user can NEVER do (hide entirely). For things they
 * can't do *yet* — publish before marks are verified — render the control
 * disabled with an explanation instead, so the path stays discoverable.
 */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: string | string[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const can = usePermission();
  return can(permission) ? <>{children}</> : <>{fallback}</>;
}
