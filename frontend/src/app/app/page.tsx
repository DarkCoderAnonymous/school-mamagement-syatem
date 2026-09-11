'use client';

import { useAuthStore } from '@/lib/auth-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';

export default function SchoolDashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Avatar className="size-12" style={{ backgroundColor: user?.schoolPrimaryColor ?? undefined }}>
          {user?.schoolLogoUrl && <AvatarImage src={user.schoolLogoUrl} alt={user.schoolName ?? ''} />}
          <AvatarFallback>{user?.schoolName?.[0] ?? 'S'}</AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-2xl font-semibold">{user?.schoolName ?? 'Your school'}</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as {user?.firstName} {user?.lastName}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-lg font-medium">Set up your academic session to get started</p>
          <p className="text-muted-foreground max-w-sm text-sm">
            Classes, students, attendance, and fees will appear here once your school&apos;s academic session is
            configured.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
