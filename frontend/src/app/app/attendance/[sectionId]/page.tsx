'use client';

import { use, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarOff, CheckCheck, Info, Lock } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { getAttendanceRegister, saveAttendanceRegister } from '@/lib/api/school';
import type { AttendanceRegister, AttendanceStatus } from '@/lib/api/types';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_META } from '../status';
import { DateNav } from '../date-nav';
import { StudentLink } from '@/components/students/student-quick-view';

type Draft = Record<string, { status: AttendanceStatus | null; remark: string }>;

/** What the server has, as a draft. A register nobody has started opens with everyone present — tap the absentees. */
function draftFrom(reg: AttendanceRegister): Draft {
  const fresh = reg.canEdit && reg.marked === 0;
  return Object.fromEntries(
    reg.rows.map((r) => [r.student._id, { status: r.status ?? (fresh ? 'PRESENT' : null), remark: r.remark }]),
  );
}

export default function AttendanceRegisterPage({ params }: { params: Promise<{ sectionId: string }> }) {
  const { sectionId } = use(params);
  const url = useUrlState();
  const date = url.get('date');
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();

  const register = useQuery({
    queryKey: ['attendance-register', sectionId, date ?? 'today'],
    queryFn: () => getAttendanceRegister(sectionId, date),
  });
  const reg = register.data;
  // Edits belong to the version of the register they were made on: once a save
  // (or a refetch) brings a new version, the draft restarts from the server.
  const version = reg ? `${reg.date}|${reg.marked}|${reg.lastMarked?.at ?? ''}` : '';
  const [edits, setEdits] = useState<{ version: string; draft: Draft }>();
  const draft = useMemo<Draft>(
    () => (edits?.version === version ? edits.draft : reg ? draftFrom(reg) : {}),
    [edits, version, reg],
  );
  const setDraft = (update: (d: Draft) => Draft) => setEdits({ version, draft: update(draft) });
  const changed = useMemo(() => {
    if (!reg) return [];
    return reg.rows.filter((r) => {
      const d = draft[r.student._id];
      return d?.status && (d.status !== r.status || d.remark.trim() !== r.remark);
    });
  }, [reg, draft]);
  const unmarked = reg ? reg.rows.filter((r) => !draft[r.student._id]?.status).length : 0;

  const save = useMutation({
    mutationFn: () =>
      saveAttendanceRegister({
        sectionId,
        date: reg!.date,
        entries: changed.map((r) => {
          const d = draft[r.student._id]!;
          return { studentId: r.student._id, status: d.status!, remark: d.remark.trim() || undefined };
        }),
      }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['attendance-register', sectionId, date ?? 'today'], saved);
      await queryClient.invalidateQueries({ queryKey: ['attendance-board'] });
      toast.success('Register saved', {
        description: `${saved.counts.PRESENT} present, ${saved.counts.ABSENT} absent${saved.counts.LATE ? `, ${saved.counts.LATE} late` : ''}${saved.counts.LEAVE ? `, ${saved.counts.LEAVE} on leave` : ''}.`,
      });
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the register")),
  });

  const set = (studentId: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [studentId]: { ...(d[studentId] ?? { status: null, remark: '' }), ...patch } }));

  if (register.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (register.isError || !reg) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={register.error} onRetry={() => void register.refetch()} title="Couldn't load this register" />
      </div>
    );
  }

  const isToday = reg.date === reg.today;
  const title = `${reg.class.name} · Section ${reg.section.name}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={reg.classTeacher ? `Class teacher: ${reg.classTeacher}` : undefined}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Attendance', href: isToday ? '/app/attendance' : `/app/attendance?date=${reg.date}` },
          { label: title },
        ]}
        action={
          reg.canEdit && reg.rows.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => setDraft((d) => Object.fromEntries(reg.rows.map((r) => [r.student._id, { remark: d[r.student._id]?.remark ?? '', status: 'PRESENT' as const }])))}
            >
              <CheckCheck className="size-4" />
              Mark all present
            </Button>
          ) : undefined
        }
      />

      <DateNav date={reg.date} today={reg.today} onChange={(day) => url.set({ date: day })} />

      {!reg.canEdit && reg.readOnlyReason && (
        <Alert>
          {reg.dayOff ? <CalendarOff aria-hidden="true" /> : <Lock aria-hidden="true" />}
          <AlertDescription>{reg.readOnlyReason}</AlertDescription>
        </Alert>
      )}
      {reg.canEdit && reg.marked === 0 && reg.rows.length > 0 && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>Everyone starts as present — mark the students who are absent, late or on leave, then save.</AlertDescription>
        </Alert>
      )}

      {reg.rows.length === 0 ? (
        <div className="rounded-xl border">
          <EmptyState title="No students in this section" description="Admit students into this section to take its register." />
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs">
              <tr>
                <th scope="col" className="w-14 px-4 py-2.5 font-medium">Roll</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Student</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Attendance</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Remark</th>
              </tr>
            </thead>
            <tbody className="rows-stagger divide-y">
              {reg.rows.map((r) => {
                const d = draft[r.student._id] ?? { status: r.status, remark: r.remark };
                const name = `${r.student.firstName} ${r.student.lastName}`;
                return (
                  <tr key={r.student._id} className="hover:bg-muted/40 align-middle transition-colors">
                    <td className="text-muted-foreground px-4 py-2.5 tabular-nums">{r.student.rollNumber ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <StudentLink studentId={r.student._id} tab="attendance" className="font-medium">
                        {name}
                      </StudentLink>
                      <p className="text-muted-foreground font-mono text-xs">{r.student.admissionNumber}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <div role="radiogroup" aria-label={`Attendance for ${name}`} className="inline-flex gap-1">
                        {ATTENDANCE_STATUSES.map((status) => {
                          const meta = ATTENDANCE_STATUS_META[status];
                          const on = d.status === status;
                          return (
                            <button
                              key={status}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              aria-label={meta.label}
                              title={meta.label}
                              disabled={!reg.canEdit}
                              onClick={() => set(r.student._id, { status })}
                              className={cn(
                                'focus-visible:ring-ring h-8 min-w-9 rounded-md border px-2 text-xs font-semibold transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed',
                                on ? meta.selected : 'text-muted-foreground hover:bg-muted',
                                !on && !reg.canEdit && 'opacity-40',
                              )}
                            >
                              {meta.short}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="hidden px-4 py-2 md:table-cell">
                      {reg.canEdit ? (
                        <Input
                          aria-label={`Remark for ${name}`}
                          placeholder={d.status && d.status !== 'PRESENT' ? 'Reason (optional)' : ''}
                          value={d.remark}
                          maxLength={200}
                          onChange={(e) => set(r.student._id, { remark: e.target.value })}
                          className="h-8"
                        />
                      ) : (
                        <span className="text-muted-foreground">{r.remark || '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {reg.canEdit && reg.rows.length > 0 && (
        <div className="bg-background/90 sticky bottom-0 z-10 -mx-4 border-t px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
          <div className="flex items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {unmarked > 0
                ? `${unmarked} not marked yet`
                : reg.lastMarked
                  ? `Last saved ${fmt.date(reg.lastMarked.at, true)}${reg.lastMarked.by ? ` by ${reg.lastMarked.by}` : ''}`
                  : 'Everyone marked'}
            </p>
            <Button onClick={() => save.mutate()} disabled={changed.length === 0 || save.isPending}>
              {save.isPending ? 'Saving…' : changed.length ? `Save register (${changed.length})` : 'Saved'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
