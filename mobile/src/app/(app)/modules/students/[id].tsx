import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, DetailRow } from '@/components/ui/list';
import { Banner, Pill, SectionTitle } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/tabs';
import type { IconName } from '@/components/ui/icon';
import { HeaderButton } from '@/components/front-office/header-button';
import {
  ageFrom,
  ContactRow,
  fullName,
  GENDER_LABEL,
  placement,
  RELATION_LABEL,
  STUDENT_STATUS,
} from '@/components/front-office/people';
import { FEES_KEY } from '@/components/fees/fee-ui';
import { StudentFees } from '@/components/students/student-fees';
import { StudentAttendance } from '@/components/students/student-attendance';
import { StudentResults } from '@/components/students/student-results';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { ApiRequestError } from '@/lib/api/http';
import { archiveStudent, getStudent } from '@/lib/api/front-office';

type Tab = 'profile' | 'fees' | 'attendance' | 'exams' | 'tests';

/** Each tab and what it takes to see it — the same permissions guard its endpoints. */
const TABS: { value: Tab; label: string; icon: IconName; permission?: Permission }[] = [
  { value: 'profile', label: 'Profile', icon: 'student' },
  { value: 'fees', label: 'Fees', icon: 'fees', permission: Permission.FEE_INVOICE_READ },
  {
    value: 'attendance',
    label: 'Attendance',
    icon: 'attendance',
    permission: Permission.ATTENDANCE_READ,
  },
  { value: 'exams', label: 'Exams', icon: 'results', permission: Permission.EXAM_READ },
  { value: 'tests', label: 'Tests', icon: 'marks', permission: Permission.EXAM_READ },
];

/**
 * One student, in tabs: their profile and family, fees, attendance month by
 * month, and published exam and class-test results. Tabs appear only for
 * what the viewer's role may read; `tab` opens one directly.
 */
export default function StudentProfileScreen() {
  const { id, tab: initialTab } = useLocalSearchParams<{ id: string; tab?: Tab }>();
  const { user } = useSession();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const perms = user?.permissions;
  const tabs = TABS.filter((t) => !t.permission || can(perms, t.permission));
  const [tab, setTab] = useState<Tab>(() =>
    tabs.some((t) => t.value === initialTab) ? initialTab! : 'profile',
  );
  const query = useQuery({ queryKey: ['students', 'detail', id], queryFn: () => getStudent(id) });

  const refresh = () =>
    Promise.all([
      query.refetch(),
      tab === 'fees' && queryClient.invalidateQueries({ queryKey: [FEES_KEY] }),
      tab === 'attendance' &&
        queryClient.invalidateQueries({ queryKey: ['student-attendance', id] }),
      (tab === 'exams' || tab === 'tests') &&
        queryClient.invalidateQueries({ queryKey: ['exam-results', 'student', id] }),
    ]);

  const archive = useMutation({
    mutationFn: () => archiveStudent(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      await queryClient.invalidateQueries({ queryKey: ['front-office', 'class-options'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.back();
    },
    onError: (err) =>
      Alert.alert(
        "Couldn't archive the student",
        err instanceof ApiRequestError ? err.message : 'Check your connection and try again.',
      ),
  });

  const s = query.data;
  const canEdit = can(perms, Permission.STUDENT_UPDATE);

  if (!s) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: 'Student' }} />
        {query.isError ? (
          <Banner tone="danger" title="Couldn't load this student">
            {query.error instanceof ApiRequestError
              ? query.error.message
              : 'Check your connection and try again.'}
          </Banner>
        ) : (
          <ActivityIndicator color={theme.mutedForeground} />
        )}
      </View>
    );
  }

  const name = fullName(s);
  const session = typeof s.academicSessionId === 'object' ? s.academicSessionId : null;
  const guardians = s.guardians.filter((g) => g.guardianId);

  const confirmArchive = () =>
    Alert.alert(
      `Archive ${name}?`,
      'The student is hidden from lists and rosters. To record that they left, set their status to Transferred or Graduated instead — that keeps them in reports.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', style: 'destructive', onPress: () => archive.mutate() },
      ],
    );

  return (
    <Screen edges={[]} onRefresh={refresh}>
      <Stack.Screen
        options={{
          title: s.firstName,
          headerRight: canEdit
            ? () => (
                <HeaderButton
                  label="Edit"
                  accessibilityLabel={`Edit ${name}`}
                  onPress={() =>
                    router.push({ pathname: '/modules/students/edit/[id]', params: { id: s._id } })
                  }
                />
              )
            : undefined,
        }}
      />

      <Card className="flex-row items-center gap-4 p-4">
        <Avatar name={name} size={56} />
        <View className="flex-1 gap-1">
          <Text className="text-lg font-semibold text-foreground">{name}</Text>
          <Text className="text-sm text-muted-foreground">
            {placement(s.classId, s.sectionId)}
            {s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2 pt-0.5">
            <Pill label={STUDENT_STATUS[s.status].label} tone={STUDENT_STATUS[s.status].tone} />
            <Text className="text-xs text-muted-foreground" selectable>
              {s.admissionNumber}
            </Text>
          </View>
        </View>
      </Card>

      {tabs.length > 1 && (
        <Tabs label={`${name}'s records`} tabs={tabs} value={tab} onChange={setTab} />
      )}

      {tab === 'fees' && <StudentFees studentId={s._id} />}
      {tab === 'attendance' && <StudentAttendance studentId={s._id} />}
      {(tab === 'exams' || tab === 'tests') && (
        <StudentResults key={tab} studentId={s._id} kind={tab === 'exams' ? 'exam' : 'test'} />
      )}

      {tab === 'profile' && (
        <>
          <View className="gap-2.5">
            <SectionTitle title="Parents & guardians" />
            {guardians.length === 0 ? (
              <Card className="p-4">
                <Text className="text-sm text-muted-foreground">No guardian on file.</Text>
              </Card>
            ) : (
              guardians.map((link) => {
                const g = link.guardianId!;
                const gName = fullName(g);
                return (
                  <Card key={g._id} className="overflow-hidden">
                    <View className="gap-1 border-b border-border px-4 py-3">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text
                          className="flex-1 text-base font-semibold text-foreground"
                          numberOfLines={1}
                        >
                          {gName}
                        </Text>
                        {link.isPrimary && <Pill label="Primary" tone="primary" />}
                      </View>
                      <Text className="text-xs text-muted-foreground">
                        {RELATION_LABEL[link.relation]}
                        {g.occupation ? ` · ${g.occupation}` : ''}
                        {g.userId ? ' · Has a parent sign-in' : ''}
                      </Text>
                    </View>
                    <ContactRow kind="tel" value={g.phone} name={gName} last={!g.email} />
                    {g.email ? (
                      <ContactRow kind="mailto" value={g.email} name={gName} last />
                    ) : null}
                  </Card>
                );
              })
            )}
          </View>

          <View className="gap-2.5">
            <SectionTitle title="Enrolment" />
            <Card className="overflow-hidden">
              <DetailRow label="Admission number" value={s.admissionNumber} />
              <DetailRow label="Admitted on" value={formatDate(s.admissionDate)} />
              <DetailRow label="Session" value={session?.name} />
              <DetailRow label="Class" value={s.classId?.name} />
              <DetailRow
                label="Section"
                value={s.sectionId ? `Section ${s.sectionId.name}` : null}
              />
              <DetailRow label="Roll number" value={s.rollNumber} last />
            </Card>
          </View>

          <View className="gap-2.5">
            <SectionTitle title="Profile" />
            <Card className="overflow-hidden">
              <DetailRow
                label="Date of birth"
                value={`${formatDate(s.dateOfBirth)} (age ${ageFrom(s.dateOfBirth)})`}
              />
              <DetailRow label="Gender" value={GENDER_LABEL[s.gender]} />
              <DetailRow label="Blood group" value={s.bloodGroup} />
              <DetailRow label="Previous school" value={s.previousSchool} />
              <DetailRow label="Home address" value={s.address} last />
            </Card>
          </View>

          {can(perms, Permission.STUDENT_DELETE) && (
            <Button
              label="Archive student"
              icon="trash"
              variant="destructive"
              loading={archive.isPending}
              onPress={confirmArchive}
            />
          )}
        </>
      )}
    </Screen>
  );
}
