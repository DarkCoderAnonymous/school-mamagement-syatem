'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, KeyRound, Mail, Phone, User } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
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
import { useAuthStore } from '@/lib/auth-store';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, roleLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getMember, listRoles, updateMemberStatus } from '@/lib/api/school';
import { EditRolesDialog, ROLE_BLURB } from '../member-dialogs';

type Tab = 'profile' | StaffRecordTab;

const EMPLOYEE_STATUS = {
  ACTIVE: { status: 'ACTIVE', label: 'Active' },
  ON_LEAVE: { status: 'PENDING', label: 'On leave' },
  TERMINATED: { status: 'DISABLED', label: 'Terminated' },
} as const;

/**
 * One staff member: who they are here, their roles and sign-in, and — once
 * they have a staff record — their attendance and salary; for teachers, the
 * classes they take. Tabs appear only for what the viewer may read.
 */
export default function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const fmt = useSchoolFormat();
  const can = usePermission();
  const url = useUrlState();
  const queryClient = useQueryClient();
  const myMembershipId = useAuthStore((s) => s.user?.membershipId);
  const [editingRoles, setEditingRoles] = useState(false);
  const [toggling, setToggling] = useState(false);

  const query = useQuery({ queryKey: ['members', id], queryFn: () => getMember(id) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles, enabled: can(Permission.ROLE_ASSIGN) });
  const m = query.data;
  const tabs = [
    { value: 'profile' as Tab, label: 'Profile', icon: User },
    ...useStaffTabs({ teacher: Boolean(m?.teacherId), employee: Boolean(m?.employee) }),
  ];
  const requested = url.get('tab') as Tab | undefined;
  const tab: Tab = tabs.some((t) => t.value === requested) ? requested! : 'profile';

  const toggleAccess = useMutation({
    mutationFn: () => updateMemberStatus(id, m?.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
      toast.success(updated.status === 'DISABLED' ? `${fullName(m?.user)}'s access is disabled` : `${fullName(m?.user)} can sign in again`);
      setToggling(false);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't change their access")),
  });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (query.isError || !m) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this staff member" />
      </div>
    );
  }

  const name = fullName(m.user);
  const isMe = m._id === myMembershipId;
  const e = m.employee;
  const u = m.user;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${name}${isMe ? ' (you)' : ''}`}
        description={e ? [e.designation, e.department].filter(Boolean).join(' · ') : m.roles.map((r) => roleLabel(r.name)).join(', ')}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Staff & roles', href: '/app/staff' },
          { label: name },
        ]}
        meta={
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={m.status === 'ACTIVE' ? 'ACTIVE' : m.status === 'INVITED' ? 'INVITED' : 'DISABLED'} label={m.status === 'ACTIVE' ? 'Access enabled' : m.status === 'INVITED' ? 'Invited' : 'Access disabled'} />
            {e && <span className="text-muted-foreground font-mono text-xs">{e.employeeNumber}</span>}
          </div>
        }
        action={
          !isMe && (
            <>
              {can(Permission.USER_UPDATE) && (
                <Button variant="ghost" onClick={() => setToggling(true)}>
                  {m.status === 'DISABLED' ? 'Enable access' : 'Disable access'}
                </Button>
              )}
              {can(Permission.ROLE_ASSIGN) && (
                <Button onClick={() => setEditingRoles(true)} disabled={!roles.data}>
                  Change roles
                </Button>
              )}
            </>
          )
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
                  <h2 className="font-semibold">Staff record</h2>
                  {e ? (
                    <DetailList
                      items={[
                        { label: 'Employee number', value: <span className="font-mono">{e.employeeNumber}</span> },
                        { label: 'Designation', value: e.designation },
                        { label: 'Department', value: e.department },
                        { label: 'Joined', value: fmt.date(e.joiningDate) },
                        { label: 'Status', value: <StatusBadge status={EMPLOYEE_STATUS[e.status].status} label={EMPLOYEE_STATUS[e.status].label} /> },
                      ]}
                    />
                  ) : (
                    <div className="space-y-3">
                      <p className="text-muted-foreground text-sm">
                        They sign in here but aren&apos;t on the staff register or payroll yet, so there&apos;s no attendance or salary to show.
                      </p>
                      {can(Permission.PAYROLL_MANAGE) && (
                        <Link href="/app/payroll/setup" className={cn(buttonVariants({ size: 'sm', variant: 'outline' }), 'w-fit')}>
                          Add them to payroll
                        </Link>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="space-y-4 p-6">
                  <div className="flex items-center gap-2">
                    <BadgeCheck className="text-muted-foreground size-4" aria-hidden="true" />
                    <h2 className="font-semibold">Roles</h2>
                  </div>
                  {m.roles.length ? (
                    <ul className="divide-y overflow-hidden rounded-lg border">
                      {m.roles.map((r) => (
                        <li key={r._id} className="space-y-0.5 px-4 py-2.5 text-sm">
                          <p className="font-medium">{roleLabel(r.name)}</p>
                          {ROLE_BLURB[r.name] && <p className="text-muted-foreground text-xs">{ROLE_BLURB[r.name]}</p>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground text-sm">No roles — they can sign in but see nothing.</p>
                  )}
                  {m.teacherId && can(Permission.TEACHER_READ) && (
                    <Link href={`/app/teachers/${m.teacherId}`} className="text-primary text-sm hover:underline">
                      Open their teacher profile
                    </Link>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="h-fit">
              <CardContent className="space-y-4 p-6">
                <div className="flex items-center gap-2">
                  <KeyRound className="text-muted-foreground size-4" aria-hidden="true" />
                  <h2 className="font-semibold">Sign-in</h2>
                </div>
                <div className="space-y-3 text-sm">
                  {u?.email && (
                    <a href={`mailto:${u.email}`} className="hover:text-primary flex items-center gap-2">
                      <Mail className="text-muted-foreground size-3.5" aria-hidden="true" />
                      <span className="truncate">{u.email}</span>
                    </a>
                  )}
                  {u?.phone && (
                    <a href={`tel:${u.phone}`} className="hover:text-primary flex items-center gap-2 tabular-nums">
                      <Phone className="text-muted-foreground size-3.5" aria-hidden="true" />
                      {u.phone}
                    </a>
                  )}
                  <p className="text-muted-foreground text-xs">
                    {u?.mustChangePassword
                      ? "Hasn't signed in yet — a temporary password was emailed to them."
                      : u?.lastLoginAt
                        ? `Last signed in ${fmt.date(u.lastLoginAt, true)}`
                        : 'Has never signed in.'}
                  </p>
                  <p className="text-muted-foreground text-xs">Member since {fmt.date(m.createdAt)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {tab !== 'profile' && (
          <TabsContent value={tab} className="pt-4">
            <StaffRecordPanel
              tab={tab}
              teacherId={m.teacherId}
              employeeId={e?._id}
              filters={Object.fromEntries(STAFF_FILTER_KEYS.map((k) => [k, url.get(k)])) as StaffRecordFilters}
              onFiltersChange={(next) => url.set(next)}
            />
          </TabsContent>
        )}
      </Tabs>

      <EditRolesDialog member={editingRoles ? m : undefined} onOpenChange={(open) => !open && setEditingRoles(false)} roles={roles.data ?? []} />
      <ConfirmDialog
        open={toggling}
        onOpenChange={setToggling}
        title={m.status === 'DISABLED' ? `Enable ${name}?` : `Disable ${name}?`}
        description={
          m.status === 'DISABLED'
            ? 'They can sign in to this school again with their existing password.'
            : 'They lose access to this school on their next request. Their account at any other school is unaffected.'
        }
        confirmLabel={m.status === 'DISABLED' ? 'Enable access' : 'Disable access'}
        destructive={m.status !== 'DISABLED'}
        pending={toggleAccess.isPending}
        onConfirm={() => toggleAccess.mutate()}
      />
    </div>
  );
}
