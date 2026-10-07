'use client';

import { use, useState } from 'react';
import Link from 'next/link';
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
import { StatusBadge, humanizeStatus } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { DetailList } from '@/components/data/detail-list';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  RECORD_FILTER_KEYS,
  StudentRecordPanel,
  useRecordTabs,
  type RecordFilters,
  type RecordTab,
} from '@/components/students/student-records';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, RELATION_LABEL } from '@/lib/labels';
import { archiveStudent, getStudent } from '@/lib/api/school';

const STATUS_TONE = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'DISABLED',
  GRADUATED: 'VERIFIED',
  TRANSFERRED: 'EXPIRED',
} as const;
const GENDER = { MALE: 'Male', FEMALE: 'Female', OTHER: 'Other' } as const;

type Tab = 'profile' | RecordTab;

/** Age in whole years on today's date. */
function ageFrom(dob: string): number {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  if (
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const [archiving, setArchiving] = useState(false);
  const url = useUrlState();
  const tabs = [{ value: 'profile' as Tab, label: 'Profile', icon: User }, ...useRecordTabs()];
  const requested = url.get('tab') as Tab | undefined;
  const tab: Tab = tabs.some((t) => t.value === requested) ? requested! : 'profile';

  const query = useQuery({ queryKey: ['students', id], queryFn: () => getStudent(id) });
  const archive = useMutation({
    mutationFn: () => archiveStudent(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Student archived');
      router.replace('/app/students');
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't archive the student")),
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
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Couldn't load this student"
        />
      </div>
    );
  }

  const s = query.data;
  const session = typeof s.academicSessionId === 'object' ? s.academicSessionId : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fullName(s)}
        description={
          s.classId
            ? `${s.classId.name}${s.sectionId ? ` · Section ${s.sectionId.name}` : ''}`
            : undefined
        }
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Students', href: '/app/students' },
          { label: fullName(s) },
        ]}
        meta={
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={STATUS_TONE[s.status]} label={humanizeStatus(s.status)} />
            <span className="text-muted-foreground font-mono text-xs">{s.admissionNumber}</span>
          </div>
        }
        action={
          <>
            <PermissionGate permission={Permission.STUDENT_DELETE}>
              <Button variant="ghost" onClick={() => setArchiving(true)}>
                Archive
              </Button>
            </PermissionGate>
            <PermissionGate permission={Permission.STUDENT_UPDATE}>
              <Link href={`/app/students/${s._id}/edit`}>
                <Button>
                  <Pencil className="size-4" />
                  Edit
                </Button>
              </Link>
            </PermissionGate>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) =>
          url.set({
            tab: v === 'profile' ? undefined : String(v),
            ...Object.fromEntries(RECORD_FILTER_KEYS.map((k) => [k, undefined])),
          })
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
          <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-6">
              <Card>
                <CardContent className="space-y-5 p-6">
                  <h2 className="font-semibold">Profile</h2>
                  <DetailList
                    items={[
                      {
                        label: 'Date of birth',
                        value: `${fmt.date(s.dateOfBirth)} (age ${ageFrom(s.dateOfBirth)})`,
                      },
                      { label: 'Gender', value: GENDER[s.gender] },
                      { label: 'Blood group', value: s.bloodGroup },
                      { label: 'Previous school', value: s.previousSchool },
                      { label: 'Home address', value: s.address },
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-5 p-6">
                  <h2 className="font-semibold">Enrolment</h2>
                  <DetailList
                    items={[
                      {
                        label: 'Admission number',
                        value: <span className="font-mono">{s.admissionNumber}</span>,
                      },
                      { label: 'Admitted on', value: fmt.date(s.admissionDate) },
                      { label: 'Session', value: session?.name },
                      { label: 'Class', value: s.classId?.name },
                      {
                        label: 'Section',
                        value: s.sectionId ? `Section ${s.sectionId.name}` : null,
                      },
                      { label: 'Roll number', value: s.rollNumber },
                    ]}
                  />
                </CardContent>
              </Card>
            </div>

            <Card className="h-fit">
              <CardContent className="space-y-4 p-6">
                <h2 className="font-semibold">Parents & guardians</h2>
                <ul className="space-y-4">
                  {s.guardians.map((link) => {
                    const g = link.guardianId;
                    if (!g) return null;
                    return (
                      <li
                        key={g._id}
                        className="space-y-1.5 border-b pb-4 text-sm last:border-b-0 last:pb-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{fullName(g)}</p>
                          {link.isPrimary && <StatusBadge status="SCHEDULED" label="Primary" />}
                        </div>
                        <p className="text-muted-foreground text-xs">
                          {RELATION_LABEL[link.relation]}
                          {g.occupation ? ` · ${g.occupation}` : ''}
                        </p>
                        <a
                          href={`tel:${g.phone}`}
                          className="hover:text-primary flex items-center gap-2 tabular-nums"
                        >
                          <Phone className="text-muted-foreground size-3.5" aria-hidden="true" />
                          {g.phone}
                        </a>
                        {g.email && (
                          <a
                            href={`mailto:${g.email}`}
                            className="hover:text-primary flex items-center gap-2"
                          >
                            <Mail className="text-muted-foreground size-3.5" aria-hidden="true" />
                            <span className="truncate">{g.email}</span>
                          </a>
                        )}
                        {g.userId && (
                          <p className="text-muted-foreground flex items-center gap-2 text-xs">
                            <KeyRound className="size-3.5" aria-hidden="true" />
                            Has a parent sign-in
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {tab !== 'profile' && (
          <TabsContent value={tab} className="pt-4">
            <StudentRecordPanel
              studentId={s._id}
              tab={tab}
              filters={
                Object.fromEntries(RECORD_FILTER_KEYS.map((k) => [k, url.get(k)])) as RecordFilters
              }
              onFiltersChange={(next) => url.set(next)}
            />
          </TabsContent>
        )}
      </Tabs>

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={`Archive ${fullName(s)}?`}
        description="The student is hidden from lists and rosters. To record that they left, set their status to Transferred or Graduated instead — that keeps them visible in reports."
        confirmLabel="Archive student"
        destructive
        pending={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </div>
  );
}
