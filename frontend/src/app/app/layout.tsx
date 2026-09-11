import type { ReactNode } from 'react';
import { Role } from '@sms/shared';
import { RequireAuth } from '@/components/auth/require-auth';
import { NavShell } from '@/components/layout/nav-shell';

const LINKS = [{ href: '/app', label: 'Dashboard' }];

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth
      denyRoles={[Role.SUPER_ADMIN]}
      forbiddenMessage="Super Admin accounts use the admin console instead."
    >
      <NavShell brand="School Console" links={LINKS}>
        {children}
      </NavShell>
    </RequireAuth>
  );
}
