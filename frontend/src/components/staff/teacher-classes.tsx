'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Loader2, Plus, X } from 'lucide-react';
import { Permission } from '@sms/shared';
import { ToggleChip } from '@/components/form/toggle-chip';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { usePermission } from '@/lib/permissions';
import { errorMessage } from '@/lib/form-errors';
import { listAcademicSessions } from '@/lib/api/academic-sessions';
import { deleteTeachingAssignment, getTeacherClasses } from '@/lib/api/school';
import type { TeacherClasses as ClassesData } from '@/lib/api/types';
import { AssignDialog } from './assign-dialog';

export interface ClassFilters {
  /** Academic session id; undefined = the current session. */
  session?: string;
  class?: string;
  subject?: string;
}

/**
 * The classes a teacher takes in a session — sections they lead and the
 * subjects they teach in each, with every section's roll. Filter by session
 * to look back at past years, and by class or subject to narrow the list.
 * In the current session, holders of `teacher.update` add and remove
 * assignments here too.
 */
export function TeacherClasses({
  teacherId,
  profileSubjectIds,
  filters,
  onChange,
}: {
  teacherId: string;
  profileSubjectIds: string[];
  filters: ClassFilters;
  onChange: (next: { [K in keyof ClassFilters]?: string | null }) => void;
}) {
  const can = usePermission();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const q = useQuery({
    queryKey: ['teacher-classes', teacherId, filters.session ?? 'current'],
    queryFn: () => getTeacherClasses(teacherId, filters.session),
    placeholderData: keepPreviousData,
  });
  const sessions = useQuery({
    queryKey: ['academic-sessions', 'options'],
    queryFn: () => listAcademicSessions({ limit: 50, sort: '-startDate' }),
    enabled: can(Permission.SESSION_READ),
  });

  const remove = useMutation({
    mutationFn: (a: { assignmentId: string; label: string }) => deleteTeachingAssignment(a.assignmentId),
    onSuccess: async (_void, a) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['teacher-classes'] }),
        queryClient.invalidateQueries({ queryKey: ['teaching-assignments'] }),
      ]);
      toast.success(`Removed ${a.label}`);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't remove the assignment")),
  });

  const data = q.data;
  const facets = useMemo(() => facetsOf(data), [data]);

  if (!data) {
    return q.isError ? (
      <Card>
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Couldn't load their classes" />
      </Card>
    ) : (
      <Skeleton className="h-80 w-full rounded-xl" />
    );
  }

  const session = data.academicSession;
  const editable = Boolean(session?.isCurrent) && can(Permission.TEACHER_UPDATE);
  const canStudents = can(Permission.STUDENT_READ);
  // A filter left over from another session matches nothing there — ignore it.
  const classId = facets.classes.some((c) => c._id === filters.class) ? filters.class : undefined;
  const subjectId = facets.subjects.some((s) => s._id === filters.subject) ? filters.subject : undefined;
  const rows = data.sections.filter(
    (s) => (!classId || s.class._id === classId) && (!subjectId || s.subjects.some((x) => x._id === subjectId)),
  );
  const held = new Set(data.sections.flatMap((s) => s.subjects.map((x) => `${s.section._id}:${x._id}`)));
  const sessionOptions = sessions.data?.items ?? (session ? [session] : []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {sessionOptions.length > 1 ? (
            <Select value={session?._id ?? ''} onValueChange={(v) => onChange({ session: v, class: null, subject: null })}>
              <SelectTrigger className="min-w-[12rem]" aria-label="Academic session">
                <SelectValue>
                  {(v: string) => (
                    <span className="truncate">
                      <span className="text-muted-foreground">Session:</span> {sessionOptions.find((s) => s._id === v)?.name ?? '—'}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sessionOptions.map((s) => (
                  <SelectItem key={s._id} value={s._id}>
                    {s.name}
                    {s.isCurrent ? ' (current)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <h2 className="font-semibold">{session ? `${session.name}${session.isCurrent ? ' (current)' : ''}` : 'No current session'}</h2>
          )}
          {q.isFetching && <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />}
        </div>
        {editable && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Assign classes
          </Button>
        )}
      </div>

      <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-4">
        <StatCard label="Sections" value={facets.sectionCount} hint={`${facets.classes.length} class${facets.classes.length === 1 ? '' : 'es'}`} />
        <StatCard label="Class teacher of" value={facets.leading} hint={facets.leading ? 'Takes their registers' : 'Not leading a section'} />
        <StatCard label="Subjects taught" value={facets.subjects.length} hint={facets.subjects.map((s) => s.name).join(', ') || undefined} />
        <StatCard label="Students" value={facets.students} hint="Active, across their sections" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {(facets.classes.length > 1 || facets.subjects.length > 1) && (
            <div className="space-y-2">
              {facets.classes.length > 1 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by class">
                  <span className="text-muted-foreground w-16 text-xs font-medium">Class</span>
                  {facets.classes.map((c) => (
                    <ToggleChip key={c._id} on={classId === c._id} onClick={() => onChange({ class: classId === c._id ? null : c._id })}>
                      {c.name}
                    </ToggleChip>
                  ))}
                </div>
              )}
              {facets.subjects.length > 1 && (
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by subject">
                  <span className="text-muted-foreground w-16 text-xs font-medium">Subject</span>
                  {facets.subjects.map((s) => (
                    <ToggleChip key={s._id} on={subjectId === s._id} onClick={() => onChange({ subject: subjectId === s._id ? null : s._id })}>
                      {s.name}
                    </ToggleChip>
                  ))}
                </div>
              )}
            </div>
          )}

          {rows.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              className="py-10"
              title={data.sections.length ? 'No classes match these filters' : session ? `No classes in ${session.name}` : 'No current session'}
              description={
                data.sections.length
                  ? 'Clear a filter to see the rest.'
                  : editable
                    ? 'Assign the sections and subjects they take.'
                    : 'Nothing was assigned to them in this session.'
              }
            />
          ) : (
            <ul className="rows-stagger divide-y overflow-hidden rounded-lg border">
              {rows.map((row) => {
                const label = `${row.class.name} · Section ${row.section.name}`;
                return (
                  <li key={row.section._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm">
                    <div className="min-w-44 flex-1 space-y-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium">
                        {label}
                        {row.isClassTeacher && <StatusBadge status="SCHEDULED" label="Class teacher" />}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {row.studentCount} student{row.studentCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="flex flex-1 flex-wrap gap-1.5">
                      {row.subjects.length === 0 ? (
                        <span className="text-muted-foreground text-xs">No subject — class teacher only</span>
                      ) : (
                        row.subjects.map((s) => (
                          <span
                            key={s.assignmentId}
                            className={`bg-muted inline-flex items-center gap-1 rounded-md py-0.5 text-xs ${editable ? 'pr-1 pl-2' : 'px-2'}`}
                          >
                            {s.name}
                            {editable && (
                              <button
                                type="button"
                                className="hover:bg-background focus-visible:ring-ring rounded p-0.5 outline-none focus-visible:ring-2"
                                aria-label={`Remove ${s.name} in ${label}`}
                                disabled={remove.isPending}
                                onClick={() => remove.mutate({ assignmentId: s.assignmentId, label: `${s.name} in ${label}` })}
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </span>
                        ))
                      )}
                    </span>
                    {canStudents && (
                      <Link
                        href={`/app/students?classId=${row.class._id}&sectionId=${row.section._id}`}
                        className="text-primary shrink-0 text-xs hover:underline"
                      >
                        View students
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {editable && (
        <AssignDialog open={adding} onOpenChange={setAdding} teacherId={teacherId} profileSubjectIds={profileSubjectIds} existing={held} />
      )}
    </div>
  );
}

/** What the filters offer and the headline numbers — always over the whole session, not the filtered rows. */
function facetsOf(data: ClassesData | undefined) {
  const sections = data?.sections ?? [];
  const classes = new Map<string, { _id: string; name: string; order: number }>();
  const subjects = new Map<string, { _id: string; name: string }>();
  for (const s of sections) {
    classes.set(s.class._id, { _id: s.class._id, name: s.class.name, order: s.class.order ?? 0 });
    for (const x of s.subjects) subjects.set(x._id, { _id: x._id, name: x.name });
  }
  return {
    sectionCount: sections.length,
    leading: sections.filter((s) => s.isClassTeacher).length,
    students: sections.reduce((sum, s) => sum + s.studentCount, 0),
    classes: [...classes.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    subjects: [...subjects.values()].sort((a, b) => a.name.localeCompare(b.name)),
  };
}
