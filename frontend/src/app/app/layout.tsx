import type { ReactNode } from 'react';
import { Role } from '@sms/shared';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell } from '@/components/layout/app-shell';
import { SCHOOL_NAV } from '@/lib/navigation';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth
      denyRoles={[Role.SUPER_ADMIN]}
      forbiddenMessage="Super Admin accounts use the admin console instead."
    >
      <AppShell brand="School Console" nav={SCHOOL_NAV}>
        {children}
      </AppShell>
    </RequireAuth>
  );
}
