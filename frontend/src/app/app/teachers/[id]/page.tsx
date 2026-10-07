'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { KeyRound, Mail, Pencil, Phone, User } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DetailList } from '@/components/data/detail-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  STAFF_FILTER_KEYS,
  StaffRecordPanel,
  useStaffTabs,
  type StaffRecordFilters,
  type StaffRecordTab,
} from '@/components/staff/staff-records';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName } from '@/lib/labels';
import { archiveTeacher, getTeacher, getTeacherClasses } from '@/lib/api/school';
import { TeacherFormDialog } from '../teacher-form-dialog';

const STATUS_LABEL = { ACTIVE: 'Active', ON_LEAVE: 'On leave', TERMINATED: 'Terminated' } as const;
const STATUS_TONE = { ACTIVE: 'ACTIVE', ON_LEAVE: 'PENDING', TERMINATED: 'DISABLED' } as const;

type Tab = 'profile' | StaffRecordTab;

export default function TeacherDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const url = useUrlState();
  const tabs = [{ value: 'profile' as Tab, label: 'Profile', icon: User }, ...useStaffTabs({ teacher: true, employee: true })];
  const requested = url.get('tab') as Tab | undefined;
  const tab: Tab = tabs.some((t) => t.value === requested) ? requested! : 'profile';

  const query = useQuery({ queryKey: ['teachers', id], queryFn: () => getTeacher(id) });
  const archive = useMutation({
    mutationFn: () => archiveTeacher(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      toast.success('Teacher archived and their teacher access removed');
      router.replace('/app/teachers');
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't archive the teacher")),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this teacher" />
      </div>
    );
  }

  const t = query.data;
  const e = t.employee;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName(e)}
        description={[e.designation, e.department].filter(Boolean).join(' · ')}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Teachers', href: '/app/teachers' },
          { label: fullName(e) },
        ]}
        meta={
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={STATUS_TONE[e.status]} label={STATUS_LABEL[e.status]} />
            <span className="text-muted-foreground font-mono text-xs">{e.employeeNumber}</span>
          </div>
        }
        action={
          <>
            <PermissionGate permission={Permission.TEACHER_DELETE}>
              <Button variant="ghost" onClick={() => setArchiving(true)}>
                Archive
              </Button>
            </PermissionGate>
            <PermissionGate permission={Permission.TEACHER_UPDATE}>
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            </PermissionGate>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          url.set({ tab: v === 'profile' ? undefined : String(v), ...Object.fromEntries(STAFF_FILTER_KEYS.map((k) => [k, undefined])) })
        }
      >
        {tabs.length > 1 && (
          <TabsList className="h-9 max-w-full justify-start overflow-x-auto">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="px-3">
                <t.icon aria-hidden="true" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        )}

        <TabsContent value="profile" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-6">
              <Card>
                <CardContent className="space-y-5 p-6">
                  <h2 className="font-semibold">Details</h2>
                  <DetailList
                    items={[
                      { label: 'Email', value: e.email },
                      { label: 'Phone', value: e.phone },
                      { label: 'Joined', value: fmt.date(e.joiningDate) },
                      { label: 'Experience before joining', value: t.experienceYears ? `${t.experienceYears} years` : null },
                      { label: 'Qualification', value: t.qualification },
                      { label: 'Specialization', value: t.specialization },
                    ]}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-6">
                  <h2 className="font-semibold">Subjects</h2>
                  {t.subjects.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {t.subjects.map((s) => (
                        <li key={s._id} className="bg-muted rounded-md px-2.5 py-1 text-sm">
                          {s.name} <span className="text-muted-foreground font-mono text-xs">{s.code}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">No subjects assigned yet.</p>
                  )}
                </CardContent>
              </Card>

              <ThisSession teacherId={t._id} onOpen={() => url.set({ tab: 'classes' })} />
            </div>

            <Card className="h-fit">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-2">
                  <KeyRound className="text-muted-foreground size-4" aria-hidden="true" />
                  <h2 className="font-semibold">Sign-in</h2>
                </div>
                {t.account ? (
                  <div className="space-y-3 text-sm">
                    <StatusBadge
                      status={t.account.accessStatus === 'ACTIVE' ? 'ACTIVE' : 'DISABLED'}
                      label={t.account.accessStatus === 'ACTIVE' ? 'Access enabled' : 'Access disabled'}
                    />
                    <p className="flex items-center gap-2">
                      <Mail className="text-muted-foreground size-3.5" aria-hidden="true" />
                      <span className="truncate">{t.account.email}</span>
                    </p>
                    {e.phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="text-muted-foreground size-3.5" aria-hidden="true" />
                        {e.phone}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs">
                      {t.account.pendingFirstSignIn
                        ? "Hasn't signed in yet — a temporary password was emailed to them."
                        : t.account.lastLoginAt
                          ? `Last signed in ${fmt.date(t.account.lastLoginAt, true)}`
                          : 'Has never signed in.'}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">No sign-in is linked to this teacher.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {tab !== 'profile' && (
          <TabsContent value={tab} className="pt-4">
            <StaffRecordPanel
              tab={tab}
              teacherId={t._id}
              employeeId={e._id}
              profileSubjectIds={t.subjectIds ?? t.subjects.map((s) => s._id)}
              filters={Object.fromEntries(STAFF_FILTER_KEYS.map((k) => [k, url.get(k)])) as StaffRecordFilters}
              onFiltersChange={(next) => url.set(next)}
            />
          </TabsContent>
        )}
      </Tabs>

      <TeacherFormDialog open={editing} onOpenChange={setEditing} teacher={t} />
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={`Archive ${fullName(e)}?`}
        description="They're removed from the teacher list and lose teacher access to this school on their next request. Sections they led will have no class teacher."
        confirmLabel="Archive teacher"
        destructive
        pending={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </div>
  );
}

/** The profile's glance at their classes this session; the Classes tab has the rest. */
function ThisSession({ teacherId, onOpen }: { teacherId: string; onOpen: () => void }) {
  const classes = useQuery({ queryKey: ['teacher-classes', teacherId, 'current'], queryFn: () => getTeacherClasses(teacherId) });
  const sections = classes.data?.sections ?? [];
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Classes this session</h2>
            <p className="text-muted-foreground text-xs">Decides their marks entry and which registers they take.</p>
          </div>
          <Button size="sm" variant="outline" onClick={onOpen}>
            See classes
          </Button>
        </div>
        {classes.isLoading ? (
          <Skeleton className="h-10 w-full rounded-lg" />
        ) : sections.length === 0 ? (
          <p className="text-muted-foreground text-sm">Not teaching or leading any section this session.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <li key={s.section._id} className="bg-muted rounded-md px-2.5 py-1 text-sm">
                {s.class.name} · {s.section.name}
                {s.isClassTeacher && <span className="text-primary text-xs font-medium"> · class teacher</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
