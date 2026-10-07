import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Avatar, DetailRow, ListRow } from '@/components/ui/list';
import { Banner, Pill, SectionTitle } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/tabs';
import type { IconName } from '@/components/ui/icon';
import { ContactRow, EMPLOYEE_STATUS, fullName, roleLabel } from '@/components/front-office/people';
import { EmployeeAttendance } from '@/components/staff/employee-attendance';
import { StaffSalary } from '@/components/staff/staff-salary';
import { TeacherClasses } from '@/components/staff/teacher-classes';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { ApiRequestError } from '@/lib/api/http';
import { getMember, getTeacher, getTeacherClasses, type Member } from '@/lib/api/front-office';

type Tab = 'profile' | 'classes' | 'attendance' | 'salary';

/**
 * Each tab, what it needs, and what it takes to see it — the same permissions
 * guard its endpoints. Classes need a teacher record; attendance and salary an
 * employee record (teachers always have one; office staff once on payroll).
 */
const TABS: { value: Tab; label: string; icon: IconName; permission?: Permission; needs?: 'teacher' | 'employee' }[] = [
  { value: 'profile', label: 'Profile', icon: 'profile' },
  { value: 'classes', label: 'Classes', icon: 'book', permission: Permission.TEACHER_READ, needs: 'teacher' },
  { value: 'attendance', label: 'Attendance', icon: 'staffAttendance', permission: Permission.STAFF_ATTENDANCE_READ, needs: 'employee' },
  { value: 'salary', label: 'Salary', icon: 'payslip', permission: Permission.PAYROLL_READ, needs: 'employee' },
];

function useStaffTabs(has: { teacher: boolean; employee: boolean }, initial?: string) {
  const { user } = useSession();
  const tabs = TABS.filter((t) => (!t.needs || has[t.needs]) && (!t.permission || can(user?.permissions, t.permission)));
  const [chosen, setChosen] = useState<Tab | undefined>(initial as Tab | undefined);
  const tab = tabs.some((t) => t.value === chosen) ? chosen! : 'profile';
  return { tabs, tab, setTab: setChosen };
}

/** What pulling down refreshes on each record tab. */
const TAB_KEYS: Record<Exclude<Tab, 'profile'>, string> = {
  classes: 'teacher-classes',
  attendance: 'employee-attendance',
  salary: 'staff-pay',
};

/**
 * A teacher's or staff member's profile, in tabs: how to reach them and what
 * they do here, the classes they teach, their attendance month by month, and
 * their salary and payslips. Tabs appear only for what the viewer may read;
 * `tab` opens one directly. Read-only on mobile.
 */
export default function StaffMemberScreen() {
  const { id, kind, tab } = useLocalSearchParams<{ id: string; kind?: 'teacher' | 'member'; tab?: string }>();
  return kind === 'member' ? <MemberDetail id={id} initialTab={tab} /> : <TeacherProfile id={id} initialTab={tab} />;
}

function RecordTab({ tab, teacherId, employeeId }: { tab: Tab; teacherId?: string | null; employeeId?: string | null }) {
  if (tab === 'classes' && teacherId) return <TeacherClasses teacherId={teacherId} />;
  if (tab === 'attendance' && employeeId) return <EmployeeAttendance employeeId={employeeId} />;
  if (tab === 'salary' && employeeId) return <StaffSalary employeeId={employeeId} />;
  return null;
}

function Loading({ title, error }: { title: string; error: unknown }) {
  const theme = useTheme();
  return (
    <View className="flex-1 justify-center bg-background px-4">
      <Stack.Screen options={{ title }} />
      {error ? (
        <Banner tone="danger" title={`Couldn't load this ${title.toLowerCase()}`}>
          {error instanceof ApiRequestError ? error.message : 'Check your connection and try again.'}
        </Banner>
      ) : (
        <ActivityIndicator color={theme.mutedForeground} />
      )}
    </View>
  );
}

function Header({ name, lines, pill }: { name: string; lines: string[]; pill?: { label: string; tone: 'success' | 'warning' | 'neutral' | 'info' } }) {
  return (
    <Card className="flex-row items-center gap-4 p-4">
      <Avatar name={name} size={56} />
      <View className="flex-1 gap-1">
        <Text className="text-lg font-semibold text-foreground">{name}</Text>
        {lines.filter(Boolean).map((l) => (
          <Text key={l} className="text-sm text-muted-foreground" numberOfLines={2}>
            {l}
          </Text>
        ))}
        {pill && (
          <View className="flex-row pt-0.5">
            <Pill label={pill.label} tone={pill.tone} />
          </View>
        )}
      </View>
    </Card>
  );
}

function Contact({ name, phone, email }: { name: string; phone?: string; email?: string }) {
  if (!phone && !email) return null;
  return (
    <View className="gap-2.5">
      <SectionTitle title="Contact" />
      <Card className="overflow-hidden">
        {phone ? <ContactRow kind="tel" value={phone} name={name} last={!email} /> : null}
        {email ? <ContactRow kind="mailto" value={email} name={name} last /> : null}
      </Card>
    </View>
  );
}

function TeacherProfile({ id, initialTab }: { id: string; initialTab?: string }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['teachers', 'detail', id], queryFn: () => getTeacher(id) });
  const { tabs, tab, setTab } = useStaffTabs({ teacher: true, employee: true }, initialTab);
  const t = query.data;
  if (!t) return <Loading title="Teacher" error={query.error} />;

  const e = t.employee;
  const name = fullName(e);
  const status = EMPLOYEE_STATUS[e.status];
  const refresh = () =>
    Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: [tab === 'profile' ? 'teacher-classes' : TAB_KEYS[tab]] })]);

  return (
    <Screen edges={[]} onRefresh={refresh}>
      <Stack.Screen options={{ title: e.firstName }} />
      <Header name={name} lines={[[e.designation, e.department].filter(Boolean).join(' · '), e.employeeNumber]} pill={status} />
      {tabs.length > 1 && <Tabs label={`${name}'s records`} tabs={tabs} value={tab} onChange={setTab} />}

      {tab === 'profile' ? (
        <>
          <Contact name={name} phone={e.phone} email={t.account?.email ?? e.email} />
          <ThisSession teacherId={t._id} onOpen={() => setTab('classes')} />

          <View className="gap-2.5">
            <SectionTitle title="Subjects" />
            <Card className="p-4">
              {t.subjects.length ? (
                <View className="flex-row flex-wrap gap-2">
                  {t.subjects.map((s) => (
                    <View key={s._id} className="rounded-lg bg-muted px-2.5 py-1">
                      <Text className="text-sm text-foreground">
                        {s.name} <Text className="text-xs text-muted-foreground">{s.code}</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-sm text-muted-foreground">No subjects assigned yet.</Text>
              )}
            </Card>
          </View>

          <View className="gap-2.5">
            <SectionTitle title="Details" />
            <Card className="overflow-hidden">
              <DetailRow label="Joined" value={formatDate(e.joiningDate)} />
              <DetailRow label="Experience before joining" value={t.experienceYears ? `${t.experienceYears} years` : null} />
              <DetailRow label="Qualification" value={t.qualification} />
              <DetailRow label="Specialization" value={t.specialization} />
              <DetailRow
                label="Sign-in"
                value={!t.account ? 'No sign-in' : t.account.pendingFirstSignIn ? 'Invited — not signed in yet' : t.account.accessStatus === 'ACTIVE' ? 'Access enabled' : 'Access disabled'}
              />
              <DetailRow label="Last sign-in" value={t.account?.lastLoginAt ? formatDate(t.account.lastLoginAt, true) : null} last />
            </Card>
          </View>
        </>
      ) : (
        <RecordTab tab={tab} teacherId={t._id} employeeId={e._id} />
      )}
    </Screen>
  );
}

/** The profile's glance at their classes this session; the Classes tab has the rest. */
function ThisSession({ teacherId, onOpen }: { teacherId: string; onOpen: () => void }) {
  const classes = useQuery({ queryKey: ['teacher-classes', teacherId, 'current'], queryFn: () => getTeacherClasses(teacherId) });
  const sections = classes.data?.sections ?? [];
  const leading = sections.filter((s) => s.isClassTeacher);
  return (
    <View className="gap-2.5">
      <SectionTitle title="Classes this session" />
      <Card className="overflow-hidden">
        <ListRow
          last
          icon="book"
          title={
            classes.isLoading
              ? 'Loading…'
              : classes.isError
                ? "Couldn't load their classes"
                : sections.length
                  ? `${sections.length} section${sections.length === 1 ? '' : 's'}`
                  : 'Not teaching this session'
          }
          subtitle={
            sections.length
              ? [
                  sections.map((s) => `${s.class.name}-${s.section.name}`).join(', '),
                  leading.length ? `Class teacher of ${leading.map((s) => `${s.class.name}-${s.section.name}`).join(', ')}` : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : undefined
          }
          onPress={onOpen}
        />
      </Card>
    </View>
  );
}

function MemberDetail({ id, initialTab }: { id: string; initialTab?: string }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['members', 'detail', id], queryFn: () => getMember(id) });
  const m: Member | undefined = query.data;
  const { tabs, tab, setTab } = useStaffTabs({ teacher: Boolean(m?.teacherId), employee: Boolean(m?.employee) }, initialTab);
  if (!m) return <Loading title="Staff member" error={query.error} />;

  const name = fullName(m.user);
  const e = m.employee;
  const access =
    m.status === 'ACTIVE'
      ? { label: 'Access enabled', tone: 'success' as const }
      : m.status === 'INVITED'
        ? { label: 'Invited', tone: 'info' as const }
        : { label: 'Access disabled', tone: 'neutral' as const };
  const refresh = () =>
    Promise.all([query.refetch(), tab !== 'profile' && queryClient.invalidateQueries({ queryKey: [TAB_KEYS[tab]] })]);

  return (
    <Screen edges={[]} onRefresh={refresh}>
      <Stack.Screen options={{ title: m.user?.firstName ?? 'Staff member' }} />
      <Header
        name={`${name}${m._id === user?.membershipId ? ' (you)' : ''}`}
        lines={[e ? [e.designation, e.department].filter(Boolean).join(' · ') : m.roles.map((r) => roleLabel(r.name)).join(', '), e?.employeeNumber ?? '']}
        pill={access}
      />
      {tabs.length > 1 && <Tabs label={`${name}'s records`} tabs={tabs} value={tab} onChange={setTab} />}

      {tab === 'profile' ? (
        <>
          <Contact name={name} phone={m.user?.phone} email={m.user?.email} />

          <View className="gap-2.5">
            <SectionTitle title="Staff record" />
            <Card className="overflow-hidden">
              {e ? (
                <>
                  <DetailRow label="Employee no." value={e.employeeNumber} />
                  <DetailRow label="Designation" value={e.designation} />
                  <DetailRow label="Department" value={e.department} />
                  <DetailRow label="Joined" value={formatDate(e.joiningDate)} />
                  <DetailRow label="Status" value={EMPLOYEE_STATUS[e.status].label} last />
                </>
              ) : (
                <Text className="p-4 text-sm text-muted-foreground">
                  Not on the staff register or payroll yet, so there&apos;s no attendance or salary to show. They&apos;re added from the web, under Payroll.
                </Text>
              )}
            </Card>
          </View>

          <View className="gap-2.5">
            <SectionTitle title="Roles & access" />
            <Card className="gap-3 p-4">
              <View className="flex-row flex-wrap gap-2">
                {m.roles.length ? m.roles.map((r) => <Pill key={r._id} label={roleLabel(r.name)} tone="primary" />) : <Text className="text-sm text-muted-foreground">No roles.</Text>}
              </View>
              <Text className="text-xs text-muted-foreground">Roles and access are changed on the web, under Staff & roles.</Text>
            </Card>
            <Card className="overflow-hidden">
              <DetailRow label="Last sign-in" value={m.user?.mustChangePassword ? 'Invited — not signed in yet' : m.user?.lastLoginAt ? formatDate(m.user.lastLoginAt, true) : null} />
              <DetailRow label="Member since" value={formatDate(m.createdAt)} last />
            </Card>
          </View>

          {m.teacherId && can(user?.permissions, Permission.TEACHER_READ) && (
            <Card className="overflow-hidden">
              <ListRow
                last
                icon="staff"
                title="Teaching profile"
                subtitle="Subjects, qualifications and classes"
                onPress={() => router.push({ pathname: '/modules/staff/[id]', params: { id: m.teacherId!, kind: 'teacher' } })}
              />
            </Card>
          )}
        </>
      ) : (
        <RecordTab tab={tab} teacherId={m.teacherId} employeeId={e?._id} />
      )}
    </Screen>
  );
}
