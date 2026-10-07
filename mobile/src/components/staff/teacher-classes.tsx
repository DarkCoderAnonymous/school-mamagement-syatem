import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Card } from '@/components/ui/card';
import { ChoiceChips, ListRow, StatTile } from '@/components/ui/list';
import { Banner, EmptyState, Pill, SectionTitle } from '@/components/ui/primitives';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { useTheme } from '@/lib/theme';
import { ApiRequestError } from '@/lib/api/http';
import { getTeacherClasses, listAcademicSessionOptions } from '@/lib/api/front-office';

/**
 * The classes a teacher takes in a session — sections they lead and the
 * subjects they teach in each, with every section's roll. Filter by session
 * to look back at past years, and by class or subject to narrow the list.
 * Read-only on the phone: assignments are changed on the web.
 */
export function TeacherClasses({ teacherId }: { teacherId: string }) {
  const theme = useTheme();
  const { user } = useSession();
  const perms = user?.permissions;
  // Undefined = the current session.
  const [sessionId, setSessionId] = useState<string>();
  const [classId, setClassId] = useState<string>();
  const [subjectId, setSubjectId] = useState<string>();

  const q = useQuery({
    queryKey: ['teacher-classes', teacherId, sessionId ?? 'current'],
    queryFn: () => getTeacherClasses(teacherId, sessionId),
    placeholderData: keepPreviousData,
  });
  const sessions = useQuery({
    queryKey: ['academic-sessions', 'options'],
    queryFn: listAcademicSessionOptions,
    enabled: can(perms, Permission.SESSION_READ),
  });
  const data = q.data;

  const facets = useMemo(() => {
    const sections = data?.sections ?? [];
    const classes = new Map<string, { value: string; label: string; order: number }>();
    const subjects = new Map<string, { value: string; label: string }>();
    for (const s of sections) {
      classes.set(s.class._id, { value: s.class._id, label: s.class.name, order: s.class.order ?? 0 });
      for (const x of s.subjects) subjects.set(x._id, { value: x._id, label: x.name });
    }
    return {
      classes: [...classes.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
      subjects: [...subjects.values()].sort((a, b) => a.label.localeCompare(b.label)),
      leading: sections.filter((s) => s.isClassTeacher).length,
      students: sections.reduce((sum, s) => sum + s.studentCount, 0),
    };
  }, [data]);

  if (!data) {
    return q.isError ? (
      <Banner tone="danger" title="Couldn't load their classes">
        {q.error instanceof ApiRequestError ? q.error.message : 'Pull down to try again.'}
      </Banner>
    ) : (
      <ActivityIndicator className="py-10" color={theme.mutedForeground} />
    );
  }

  const session = data.academicSession;
  const sessionOptions = (sessions.data ?? []).map((s) => ({ value: s._id, label: s.isCurrent ? `${s.name} (current)` : s.name }));
  // A filter left over from another session matches nothing there — ignore it.
  const cls = facets.classes.some((c) => c.value === classId) ? classId : undefined;
  const subj = facets.subjects.some((s) => s.value === subjectId) ? subjectId : undefined;
  const rows = data.sections.filter((s) => (!cls || s.class._id === cls) && (!subj || s.subjects.some((x) => x._id === subj)));
  const canStudents = can(perms, Permission.STUDENT_READ);

  return (
    <View className="gap-5">
      {sessionOptions.length > 1 ? (
        <ChoiceChips
          label="Academic session"
          options={sessionOptions}
          value={session?._id}
          onChange={(v) => {
            if (!v) return;
            setSessionId(v);
            setClassId(undefined);
            setSubjectId(undefined);
          }}
        />
      ) : (
        <Text className="text-sm font-semibold text-foreground">{session ? `${session.name}${session.isCurrent ? ' (current)' : ''}` : 'No current session'}</Text>
      )}

      <View className="gap-3">
        <View className="flex-row gap-3">
          <StatTile label="Sections" value={String(data.sections.length)} hint={`${facets.classes.length} class${facets.classes.length === 1 ? '' : 'es'}`} />
          <StatTile label="Class teacher of" value={String(facets.leading)} hint={facets.leading ? 'Takes their registers' : 'None'} />
        </View>
        <View className="flex-row gap-3">
          <StatTile label="Subjects" value={String(facets.subjects.length)} hint={facets.subjects.map((s) => s.label).join(', ') || undefined} />
          <StatTile label="Students" value={String(facets.students)} hint="Active, across sections" />
        </View>
      </View>

      <View className="gap-2.5">
        <SectionTitle title="Classes" action={q.isFetching ? <ActivityIndicator size="small" color={theme.mutedForeground} /> : undefined} />
        {facets.classes.length > 1 && <ChoiceChips label="Filter by class" options={facets.classes} value={cls} onChange={setClassId} />}
        {facets.subjects.length > 1 && <ChoiceChips label="Filter by subject" options={facets.subjects} value={subj} onChange={setSubjectId} />}
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon="book"
              title={data.sections.length ? 'No classes match' : session ? `No classes in ${session.name}` : 'No current session'}
              description={data.sections.length ? 'Clear a filter to see the rest.' : 'Assignments are made on the web, on their teacher profile.'}
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {rows.map((r, i) => {
              const subjects = r.subjects.map((s) => s.name).join(', ') || 'Class teacher only';
              const roll = `${r.studentCount} student${r.studentCount === 1 ? '' : 's'}`;
              return (
                <ListRow
                  key={r.section._id}
                  icon="book"
                  title={`${r.class.name} · Section ${r.section.name}`}
                  subtitle={`${subjects} · ${roll}`}
                  trailing={r.isClassTeacher ? <Pill label="Class teacher" tone="primary" /> : undefined}
                  last={i === rows.length - 1}
                  onPress={
                    canStudents
                      ? () => router.push({ pathname: '/modules/students', params: { classId: r.class._id, sectionId: r.section._id } })
                      : undefined
                  }
                />
              );
            })}
          </Card>
        )}
      </View>
    </View>
  );
}
