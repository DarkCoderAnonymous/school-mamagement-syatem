import type { ReactNode } from 'react';
import { Role } from '@sms/shared';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell } from '@/components/layout/app-shell';
import { ADMIN_NAV } from '@/lib/navigation';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth
      allowRoles={[Role.SUPER_ADMIN]}
      forbiddenMessage="The Super Admin console is only available to Super Admin accounts."
    >
      <AppShell brand="Super Admin" nav={ADMIN_NAV}>
        {children}
      </AppShell>
    </RequireAuth>
  );
}
