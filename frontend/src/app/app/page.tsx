'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarRange,
  Check,
  CircleDashed,
  ClipboardCheck,
  GraduationCap,
  Package,
  School,
  Users,
} from 'lucide-react';
import { Permission } from '@sms/shared';
import { useAuthStore } from '@/lib/auth-store';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { getDashboardSummary } from '@/lib/api/school';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { MyClassesCard } from './my-classes-card';
import {
  DuesCard,
  FeeCollectionCard,
  KpiTile,
  LowStockCard,
  StaffAttendanceCard,
  StudentAttendanceCard,
} from './_dashboard/cards';

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

  const summary = useQuery({ queryKey: ['dashboard', 'summary'], queryFn: getDashboardSummary });
  const d = summary.data;

  const steps: SetupStep[] = d
    ? [
        {
          key: 'session',
          label: 'Create your academic session',
          description:
            'The school year that classes, attendance, exams and fees are recorded against.',
          done: Boolean(d.currentSession),
          href: '/app/sessions',
          permission: Permission.SESSION_READ,
        },
        {
          key: 'classes',
          label: 'Add classes and sections',
          description:
            'Your grades for this session, each split into sections with a class teacher.',
          done: (d.academics?.sections ?? 0) > 0,
          href: '/app/classes',
          permission: Permission.CLASS_READ,
        },
        {
          key: 'subjects',
          label: 'List your subjects',
          description:
            'What’s taught — teachers are matched to these, and exams are set per subject.',
          done: (d.academics?.subjects ?? 0) > 0,
          href: '/app/subjects',
          permission: Permission.CLASS_READ,
        },
        {
          key: 'teachers',
          label: 'Add your teachers',
          description: 'Each teacher gets their own sign-in for attendance and marks.',
          done: (d.teachers?.total ?? 0) > 0,
          href: '/app/teachers',
          permission: Permission.TEACHER_READ,
        },
        {
          key: 'students',
          label: 'Admit students',
          description: 'Admission numbers are issued automatically, with guardians on file.',
          done: (d.students?.active ?? 0) > 0,
          href: '/app/students/new',
          permission: Permission.STUDENT_CREATE,
        },
      ]
    : [];

  const visibleSteps = steps.filter((step) => can(step.permission));
  const remaining = visibleSteps.filter((step) => !step.done);
  const hasAnyBlock = Boolean(
    d &&
    (d.students ||
      d.teachers ||
      d.academics ||
      d.inventory ||
      d.fees ||
      d.currentSession ||
      d.attendance ||
      d.staffAttendance),
  );
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greeting}${user?.firstName ? `, ${user.firstName}` : ''}`}
        description={[user?.schoolName, d?.currentSession?.name, todayLabel]
          .filter(Boolean)
          .join(' · ')}
        action={
          <>
            {can(Permission.STUDENT_CREATE) && (
              <Link href="/app/students/new" className={buttonVariants({ variant: 'outline' })}>
                <GraduationCap className="size-4" />
                Admit student
              </Link>
            )}
            {can(Permission.ATTENDANCE_MARK) && (
              <Link href="/app/attendance" className={buttonVariants()}>
                <ClipboardCheck className="size-4" />
                Take attendance
              </Link>
            )}
          </>
        }
      />

      <MyClassesCard />

      {summary.isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      )}

      {summary.isError && (
        <Card>
          <CardContent className="p-0">
            <ErrorState
              error={summary.error}
              onRetry={() => void summary.refetch()}
              title="Couldn't load your dashboard"
            />
          </CardContent>
        </Card>
      )}

      {summary.isSuccess && !hasAnyBlock && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-medium">Nothing to show here yet</p>
            <p className="text-muted-foreground mt-1 text-sm">
              Your account doesn&apos;t have access to any dashboard data. Ask your school
              administrator if you think this is wrong.
            </p>
          </CardContent>
        </Card>
      )}

      {d && hasAnyBlock && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {d.students && (
            <KpiTile
              href="/app/students"
              label="Students"
              value={fmt.number(d.students.active)}
              hint={`${d.students.female} girls · ${d.students.male} boys${d.students.admittedLast30Days ? ` · ${d.students.admittedLast30Days} new this month` : ''}`}
              icon={GraduationCap}
            />
          )}
          {d.teachers && (
            <KpiTile
              href="/app/teachers"
              label="Teachers"
              value={fmt.number(d.teachers.total)}
              hint={
                d.students && d.teachers.total
                  ? `${Math.round(d.students.active / d.teachers.total)} students per teacher`
                  : undefined
              }
              icon={Users}
              hue="teal"
            />
          )}
          {d.academics && (
            <KpiTile
              href="/app/classes"
              label="Classes"
              value={fmt.number(d.academics.classes)}
              hint={`${d.academics.sections} sections · ${d.academics.subjects} subjects`}
              icon={School}
              hue="violet"
            />
          )}
          {d.inventory ? (
            <KpiTile
              href="/app/inventory"
              label="Stock value"
              value={fmt.money(d.inventory.stockValueMinor)}
              hint={`${d.inventory.itemCount} items · ${d.inventory.lowStockCount} low · ${d.inventory.outOfStockCount} out`}
              icon={Package}
              hue="slate"
            />
          ) : (
            d.currentSession && (
              <KpiTile
                label="Current session"
                value={d.currentSession.name}
                hint={`${fmt.date(d.currentSession.startDate)} – ${fmt.date(d.currentSession.endDate)}`}
                icon={CalendarRange}
                hue="slate"
              />
            )
          )}
        </div>
      )}

      {d &&
        (d.attendance ||
          d.staffAttendance ||
          (d.inventory && d.inventory.lowStockItems.length > 0)) && (
          <div className="grid gap-4 lg:grid-cols-4">
            {d.attendance && <StudentAttendanceCard data={d.attendance} />}
            {d.staffAttendance && <StaffAttendanceCard data={d.staffAttendance} />}
            {d.inventory && d.inventory.lowStockItems.length > 0 && (
              <LowStockCard inventory={d.inventory} />
            )}
          </div>
        )}

      {d?.fees && (
        <div className="grid gap-4 lg:grid-cols-3">
          <FeeCollectionCard fees={d.fees} />
          <DuesCard fees={d.fees} />
        </div>
      )}

      {summary.isSuccess && remaining.length > 0 && (
        <Card className="max-w-3xl">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="text-lg leading-7 font-semibold">Finish setting up your school</h2>
              <p className="text-muted-foreground text-sm">
                {remaining.length} of {visibleSteps.length} step
                {visibleSteps.length === 1 ? '' : 's'} left. Each one unlocks the next.
              </p>
            </div>

            <ol className="divide-y rounded-lg border">
              {visibleSteps.map((step) => (
                <li key={step.key} className="flex items-start gap-3 p-4">
                  {step.done ? (
                    <span className="bg-success-soft text-success mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full">
                      <Check className="size-3" aria-label="Done" />
                    </span>
                  ) : (
                    <CircleDashed
                      className="text-muted-foreground mt-0.5 size-5 shrink-0"
                      aria-label="To do"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        step.done
                          ? 'text-muted-foreground text-sm line-through'
                          : 'text-sm font-medium'
                      }
                    >
                      {step.label}
                    </p>
                    {!step.done && (
                      <p className="text-muted-foreground text-xs">{step.description}</p>
                    )}
                  </div>
                  {!step.done && (
                    <Link href={step.href}>
                      <Button size="sm">Set up</Button>
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
