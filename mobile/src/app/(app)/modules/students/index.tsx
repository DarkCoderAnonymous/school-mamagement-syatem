import { useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Card } from '@/components/ui/card';
import { Avatar, ChoiceChips, ListRow, PagedList, SearchField } from '@/components/ui/list';
import { OptionPicker, useDebounced } from '@/components/ui/form';
import { Pill } from '@/components/ui/primitives';
import { HeaderButton } from '@/components/front-office/header-button';
import { fullName, placement, STUDENT_STATUS } from '@/components/front-office/people';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { getMyClasses } from '@/lib/api/attendance';
import { listClassOptions, listStudents, type Student, type StudentListFilters, type StudentStatus } from '@/lib/api/front-office';

const ALL = 'all';
const STATUS_OPTIONS = (Object.keys(STUDENT_STATUS) as StudentStatus[]).map((s) => ({ value: s, label: STUDENT_STATUS[s].label }));

/**
 * Everyone enrolled, searchable by name, admission or roll number. A teacher
 * (who doesn't run the whole school's attendance) starts on their own
 * sections; the office starts on the whole school.
 */
export default function StudentsScreen() {
  const { user } = useSession();
  const params = useLocalSearchParams<{ classId?: string; sectionId?: string }>();
  const perms = user?.permissions;
  const canClasses = can(perms, Permission.CLASS_READ);

  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim(), 350);
  const [classId, setClassId] = useState<string | undefined>(params.classId);
  const [sectionId, setSectionId] = useState<string | undefined>(params.sectionId);
  const [status, setStatus] = useState<StudentStatus | undefined>('ACTIVE');

  const classes = useQuery({ queryKey: ['front-office', 'class-options'], queryFn: listClassOptions, enabled: canClasses, staleTime: 5 * 60_000 });
  const sections = classes.data?.find((c) => c._id === classId)?.sections ?? [];

  // "My sections" is for teachers: they hold class.read but not attendance.manage, and teach somewhere.
  const isTeacher = canClasses && !can(perms, Permission.ATTENDANCE_MANAGE);
  const mine = useQuery({ queryKey: ['my-classes'], queryFn: getMyClasses, enabled: isTeacher, staleTime: 5 * 60_000 });
  const mySections = mine.data?.sections ?? [];
  const [scopeChoice, setScopeChoice] = useState<'mine' | 'all'>();
  const scope = scopeChoice ?? (mySections.length > 0 && !params.classId ? 'mine' : 'all');
  const [mySectionId, setMySectionId] = useState<string>();
  const activeMySection = mySections.find((s) => s.section._id === mySectionId) ?? mySections[0];
  const showMine = mySections.length > 0 && scope === 'mine';

  const filters: StudentListFilters = useMemo(
    () =>
      showMine && activeMySection
        ? { search: debounced || undefined, classId: activeMySection.class._id, sectionId: activeMySection.section._id, status }
        : { search: debounced || undefined, classId, sectionId, status },
    [showMine, activeMySection, debounced, classId, sectionId, status],
  );
  const filtered = Boolean(filters.search || filters.classId || filters.status !== 'ACTIVE');

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: 'Students',
          headerRight: can(perms, Permission.STUDENT_CREATE)
            ? () => (
                <HeaderButton
                  label="Admit"
                  icon="plus"
                  accessibilityLabel="Admit a student"
                  onPress={() =>
                    router.push({
                      pathname: '/modules/students/new',
                      params: filters.classId ? { classId: filters.classId, ...(filters.sectionId ? { sectionId: filters.sectionId } : {}) } : {},
                    })
                  }
                />
              )
            : undefined,
        }}
      />
      <PagedList<Student>
        queryKey={['students', 'list', filters]}
        fetchPage={(page) => listStudents(page, filters)}
        // A teacher's first page waits for their sections, so it doesn't load the whole school first.
        enabled={!isTeacher || !mine.isLoading}
        keyExtractor={(s) => s._id}
        header={
          <View className="gap-3 pb-2">
            <SearchField value={search} onChangeText={setSearch} placeholder="Search name, admission or roll no." />

            {mySections.length > 0 && (
              <ChoiceChips
                label="Which students"
                options={[
                  { value: 'mine' as const, label: 'My sections' },
                  { value: 'all' as const, label: 'Whole school' },
                ]}
                value={scope}
                onChange={(v) => v && setScopeChoice(v)}
              />
            )}

            {showMine ? (
              mySections.length > 1 && (
                <ChoiceChips
                  label="My section"
                  options={mySections.map((s) => ({ value: s.section._id, label: `${s.class.name} · ${s.section.name}` }))}
                  value={activeMySection?.section._id}
                  onChange={(v) => v && setMySectionId(v)}
                />
              )
            ) : canClasses ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <OptionPicker
                    label="Class"
                    value={classId ?? ALL}
                    placeholder={classes.isLoading ? 'Loading…' : 'All classes'}
                    options={[{ value: ALL, label: 'All classes' }, ...(classes.data ?? []).map((c) => ({ value: c._id, label: c.name, description: `${c.studentCount} students` }))]}
                    onChange={(v) => {
                      setClassId(v === ALL ? undefined : v);
                      setSectionId(undefined);
                    }}
                  />
                </View>
                <View className="flex-1">
                  <OptionPicker
                    label="Section"
                    value={sectionId ?? ALL}
                    disabled={!classId || sections.length === 0}
                    placeholder="All sections"
                    options={[{ value: ALL, label: 'All sections' }, ...sections.map((s) => ({ value: s._id, label: `Section ${s.name}`, description: `${s.studentCount}/${s.capacity} students` }))]}
                    onChange={(v) => setSectionId(v === ALL ? undefined : v)}
                  />
                </View>
              </View>
            ) : null}

            <ChoiceChips label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            {status === undefined && <Text className="px-1 text-xs text-muted-foreground">Showing every status.</Text>}
          </View>
        }
        empty={
          filtered
            ? { icon: 'search', title: 'No students match', description: 'Try a different search, or clear the filters.' }
            : { icon: 'student', title: 'No students yet', description: 'Admitted students appear here with their admission number.' }
        }
        renderItem={(s) => <StudentRow student={s} />}
      />
    </View>
  );
}

function StudentRow({ student: s }: { student: Student }) {
  const name = fullName(s);
  const where = placement(s.classId, s.sectionId);
  const subtitle = [s.admissionNumber, where, s.rollNumber ? `Roll ${s.rollNumber}` : null].filter(Boolean).join(' · ');
  return (
    <Card className="overflow-hidden">
      <ListRow
        last
        title={name}
        subtitle={subtitle}
        leading={<Avatar name={name} />}
        trailing={s.status !== 'ACTIVE' ? <Pill label={STUDENT_STATUS[s.status].label} tone={STUDENT_STATUS[s.status].tone} /> : undefined}
        accessibilityLabel={`${name}, ${subtitle}`}
        onPress={() => router.push({ pathname: '/modules/students/[id]', params: { id: s._id } })}
      />
    </Card>
  );
}
