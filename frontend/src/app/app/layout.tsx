import type { ReactNode } from 'react';
import { Role } from '@sms/shared';
import { RequireAuth } from '@/components/auth/require-auth';
import { AppShell } from '@/components/layout/app-shell';
import { SchoolPalette } from '@/components/school/school-palette';
import { StudentQuickViewProvider } from '@/components/students/student-quick-view';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth
      denyRoles={[Role.SUPER_ADMIN]}
      forbiddenMessage="Super Admin accounts use the admin console instead."
    >
      <SchoolPalette />
      <AppShell brand="School Console" navKey="school">
        <StudentQuickViewProvider>{children}</StudentQuickViewProvider>
      </AppShell>
    </RequireAuth>
  );
}
