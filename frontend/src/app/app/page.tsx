'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarRange, Check, CircleDashed } from 'lucide-react';
import { Permission } from '@sms/shared';
import { useAuthStore } from '@/lib/auth-store';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { getCurrentAcademicSession } from '@/lib/api/academic-sessions';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatCard } from '@/components/ui/stat-card';

/**
 * Setup checklist. Steps are added here as each module ships — only steps that
 * lead to a working screen appear, so the list never promises something the
 * product can't yet do. The checklist disappears once every step is done.
 */
interface SetupStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href: string;
  permission: string;
}

export default function SchoolDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const can = usePermission();
  const fmt = useSchoolFormat();

  const canReadSessions = can(Permission.SESSION_READ);

  const sessionQuery = useQuery({
    queryKey: ['academic-sessions', 'current'],
    queryFn: getCurrentAcademicSession,
    enabled: canReadSessions,
  });

  const steps: SetupStep[] = canReadSessions
    ? [
        {
          key: 'session',
          label: 'Create your academic session',
          description: 'The school year that classes, attendance, exams and fees are recorded against.',
          done: Boolean(sessionQuery.data),
          href: '/app/sessions',
          permission: Permission.SESSION_READ,
        },
      ]
    : [];

  const visibleSteps = steps.filter((step) => can(step.permission));
  const remaining = visibleSteps.filter((step) => !step.done);
  const setupComplete = visibleSteps.length > 0 && remaining.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={user?.schoolName ?? 'Your school'}
        description={`Signed in as ${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}
      />

      {!canReadSessions && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium">Nothing to show here yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Your account doesn&apos;t have access to any dashboard data. Ask your school administrator if you
              think this is wrong.
            </p>
          </CardContent>
        </Card>
      )}

      {canReadSessions && sessionQuery.isLoading && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-16 w-full" />
          </CardContent>
        </Card>
      )}

      {canReadSessions && sessionQuery.isError && (
        <Card>
          <CardContent className="p-0">
            <ErrorState
              error={sessionQuery.error}
              onRetry={() => void sessionQuery.refetch()}
              title="Couldn't load your school's setup"
            />
          </CardContent>
        </Card>
      )}

      {canReadSessions && sessionQuery.isSuccess && !setupComplete && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="text-lg leading-7 font-semibold">Finish setting up your school</h2>
              <p className="text-muted-foreground text-sm">
                {remaining.length} step{remaining.length === 1 ? '' : 's'} left. Classes, students, attendance
                and fees unlock as you go.
              </p>
            </div>

            <ul className="divide-y rounded-lg border">
              {visibleSteps.map((step) => (
                <li key={step.key} className="flex items-start gap-3 p-4">
                  {step.done ? (
                    <span className="bg-success-soft text-success mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                      <Check className="size-3" />
                    </span>
                  ) : (
                    <CircleDashed className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-muted-foreground text-xs">{step.description}</p>
                  </div>
                  {!step.done && (
                    <Link href={step.href}>
                      <Button size="sm">Set up</Button>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {canReadSessions && sessionQuery.isSuccess && sessionQuery.data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Current session"
            value={sessionQuery.data.name}
            hint={`${fmt.date(sessionQuery.data.startDate)} – ${fmt.date(sessionQuery.data.endDate)}`}
            icon={CalendarRange}
            footer={
              <Link
                href="/app/sessions"
                className="text-primary mt-2 inline-block text-xs hover:underline"
              >
                Manage sessions
              </Link>
            }
          />
        </div>
      )}
    </div>
  );
}
