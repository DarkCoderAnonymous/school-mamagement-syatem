'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { Role } from '@sms/shared';
import { useAuthStore } from '@/lib/auth-store';
import { Skeleton } from '@/components/ui/skeleton';

interface RequireAuthProps {
  children: ReactNode;
  /**
   * Plain role arrays rather than a predicate function: layout.tsx files
   * that render this are Server Components, and React forbids passing
   * functions as props across the server/client boundary (they aren't
   * serializable) — only plain data like this can cross.
   */
  allowRoles?: Role[];
  denyRoles?: Role[];
  /** Shown instead of redirecting when logged in but the role check fails. */
  forbiddenMessage?: string;
}

/**
 * Client-side auth guard for the /admin and /app route groups.
 *
 * There is no server-side proxy check here: the access token lives only in
 * browser memory (never a cookie), and the httpOnly refresh cookie the
 * backend sets is deliberately path-scoped to its own /api/v1/auth routes,
 * so a Next.js proxy running on the frontend's origin would never see it on
 * a page navigation anyway. Gating in the client, after AuthProvider's boot
 * sequence resolves, is the architecturally correct fit for this
 * decoupled-API setup — the same pattern the mobile app uses.
 */
export function RequireAuth({ children, allowRoles, denyRoles, forbiddenMessage }: RequireAuthProps) {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const pathname = usePathname();
  // A temporary password must be replaced before anything else: the API refuses
  // every non-/auth call until it is (PASSWORD_CHANGE_REQUIRED).
  const mustChangePassword = !!user?.mustChangePassword && pathname !== '/change-password';

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
    else if (mustChangePassword) router.replace('/change-password');
  }, [status, mustChangePassword, router]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (status === 'unauthenticated' || !user || mustChangePassword) {
    return null;
  }

  const allowed = allowRoles ? allowRoles.some((r) => user.roles.includes(r)) : true;
  const denied = denyRoles ? denyRoles.some((r) => user.roles.includes(r)) : false;

  if (!allowed || denied) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold">Access restricted</h1>
        <p className="text-muted-foreground text-sm">
          {forbiddenMessage ?? "You don't have access to this area."}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
