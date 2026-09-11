import type { ReactNode } from 'react';
import { Role } from '@sms/shared';
import { RequireAuth } from '@/components/auth/require-auth';
import { NavShell } from '@/components/layout/nav-shell';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/registrations', label: 'Registrations' },
  { href: '/admin/schools', label: 'Schools' },
  { href: '/admin/plans', label: 'Plans' },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth
      allowRoles={[Role.SUPER_ADMIN]}
      forbiddenMessage="The Super Admin console is only available to Super Admin accounts."
    >
      <NavShell brand="SMS · Super Admin" links={LINKS}>
        {children}
      </NavShell>
    </RequireAuth>
  );
}
