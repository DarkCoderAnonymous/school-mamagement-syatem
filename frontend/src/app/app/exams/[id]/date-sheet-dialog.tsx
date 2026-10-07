'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { useClassOptions, useSubjectOptions } from '@/hooks/use-school-options';
import { errorMessage } from '@/lib/form-errors';
import { PAPER_STATUS_LABEL } from '@/lib/labels';
import { examDays, isSunday, weekday } from '@/lib/date-sheet';
import { cn } from '@/lib/utils';
import { saveDateSheet } from '@/lib/api/exams';
import type { ExamDetail, ExamPaper } from '@/lib/api/types';

interface Row {
  on: boolean;
  date: string;
  startTime: string;
  maxMarks: string;
  passMarks: string;
}

/** The customary 33% pass mark, rounded up to a whole mark. */
const passFor = (max: string) => String(Math.ceil(Number(max) * 0.33) || 0);
const blank: Row = { on: false, date: '', startTime: '09:00', maxMarks: '100', passMarks: '33' };

function rowsFrom(papers: ExamPaper[]): Record<string, Row> {
  return Object.fromEntries(
    papers.map((p) => [
      p.subjectId?._id ?? '',
      { on: true, date: p.date?.slice(0, 10) ?? '', startTime: p.startTime ?? '', maxMarks: String(p.maxMarks), passMarks: String(p.passMarks) },
    ]),
  );
}

/**
 * One class's date sheet — "Grade 1: which subject on which day" — the way a
 * school prints it. Tick the class's subjects, give each a date (the day is
 * worked out), a start time and its marks. Subjects already on the sheet are
 * rescheduled in place; one past marks entry is locked.
 */
export function DateSheetDialog({
  exam,
  classId: initialClassId,
  open,
  onOpenChange,
}: {
  exam: ExamDetail;
  classId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const classes = useClassOptions(open);
  const subjects = useSubjectOptions(open);
  const [classId, setClassId] = useState('');
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [error, setError] = useState<string | null>(null);

  const papersOf = (cid: string) => exam.papers.filter((p) => p.classId?._id === cid);
  const pickClass = (cid: string) => {
    setClassId(cid);
    setRows(rowsFrom(papersOf(cid)));
    setError(null);
  };

  // Start from the given class (or the first one) each time the dialog opens — during render, not in an effect.
  const [wasOpen, setWasOpen] = useState(false);
  const firstClass = initialClassId ?? classes.data?.[0]?._id;
  if (open !== wasOpen && (!open || firstClass)) {
    setWasOpen(open);
    if (open && firstClass) pickClass(firstClass);
  }

  const existing = new Map(papersOf(classId).map((p) => [p.subjectId?._id ?? '', p]));
  const row = (sid: string): Row => rows[sid] ?? blank;
  const setRow = (sid: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [sid]: { ...row(sid), ...patch } }));
  const locked = (sid: string) => {
    const p = existing.get(sid);
    return Boolean(p && p.status !== 'OPEN');
  };

  const minDate = exam.startDate.slice(0, 10);
  const maxDate = exam.endDate.slice(0, 10);
  const ticked = (subjects.data ?? []).filter((s) => row(s._id).on);
  const editable = ticked.filter((s) => !locked(s._id));
  const perDay = new Map<string, number>();
  for (const s of ticked) {
    const d = row(s._id).date;
    if (d) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const problems = editable.flatMap((s) => {
    const r = row(s._id);
    const max = Number(r.maxMarks);
    const pass = Number(r.passMarks);
    if (!(max >= 1) || !(pass >= 0) || pass > max) return [`${s.name}: check the marks`];
    if (r.date && (r.date < minDate || r.date > maxDate)) return [`${s.name}: the date is outside the exam`];
    return [];
  });
  const otherClasses = (classes.data ?? []).filter((c) => c._id !== classId && papersOf(c._id).length > 0);

  /** Consecutive days from the exam's start, skipping Sundays, in the order the subjects are listed. */
  const autoFill = () => {
    const targets = editable.map((s) => s._id);
    const days = examDays(minDate, maxDate, targets.length);
    setRows((r) => {
      const next = { ...r };
      targets.forEach((sid, i) => (next[sid] = { ...(next[sid] ?? blank), date: days[i] ?? '' }));
      return next;
    });
    if (days.length < targets.length) toast.warning(`Only ${days.length} exam days (Sundays off) — ${targets.length - days.length} subjects still need a date`);
  };

  /** Takes another class's schedule for the subjects it shares — Grades 1–3 usually sit the same sheet. */
  const copyFrom = (cid: string) => {
    const source = rowsFrom(papersOf(cid));
    setRows((r) => {
      const next = { ...r };
      for (const [sid, src] of Object.entries(source)) if (!locked(sid)) next[sid] = src;
      return next;
    });
  };

  const className = classes.data?.find((c) => c._id === classId)?.name ?? 'Class';
  const mutation = useMutation({
    mutationFn: () =>
      saveDateSheet(
        exam._id,
        classId,
        editable.map((s) => {
          const r = row(s._id);
          return { subjectId: s._id, date: r.date || null, startTime: r.startTime || null, maxMarks: Number(r.maxMarks), passMarks: Number(r.passMarks) };
        }),
      ),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
      await queryClient.invalidateQueries({ queryKey: ['marks-board'] });
      toast.success(`${className} date sheet saved`, {
        description: [res.created && `${res.created} added`, res.updated && `${res.updated} rescheduled`].filter(Boolean).join(', ') || 'Nothing changed.',
        action: { label: 'Print', onClick: () => router.push(`/app/exams/${exam._id}/date-sheet?classId=${classId}`) },
      });
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e, "Couldn't save the date sheet")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Date sheet</DialogTitle>
          <DialogDescription>
            Pick a class and give each subject its day. {exam.name} runs {minDate} to {maxDate}.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="bg-destructive-soft text-destructive animate-shake flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Class">
            {({ id }) => (
              <NativeSelect id={id} value={classId} onChange={(e) => pickClass(e.target.value)}>
                {classes.data?.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {papersOf(c._id).length ? ` · ${papersOf(c._id).length} papers` : ''}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Field label="Copy schedule from">
            {({ id }) => (
              <NativeSelect id={id} value="" disabled={otherClasses.length === 0} onChange={(e) => e.target.value && copyFrom(e.target.value)}>
                <option value="">{otherClasses.length ? 'Another class…' : 'No other class has one yet'}</option>
                {otherClasses.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <Button type="button" variant="outline" onClick={autoFill} disabled={editable.length === 0}>
            <CalendarDays className="size-4" />
            Fill dates
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-3 py-2 font-medium">Subject</th>
                <th className="px-2 py-2 font-medium">Date</th>
                <th className="px-2 py-2 font-medium">Day</th>
                <th className="px-2 py-2 font-medium">Time</th>
                <th className="px-2 py-2 font-medium">Max</th>
                <th className="px-2 py-2 font-medium">Pass</th>
              </tr>
            </thead>
            <tbody>
              {subjects.data?.map((s) => {
                const r = row(s._id);
                const paper = existing.get(s._id);
                const lock = locked(s._id);
                const off = !r.on || lock;
                const clash = r.on && r.date && (perDay.get(r.date) ?? 0) > 1;
                return (
                  <tr key={s._id} className={cn('border-b last:border-0', !r.on && 'text-muted-foreground')}>
                    <td className="px-3 py-1.5">
                      <label className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          className="accent-primary size-4"
                          checked={r.on}
                          // A paper already on the sheet is removed from the exam page, where its marks are checked.
                          disabled={Boolean(paper)}
                          title={paper ? 'Already on the date sheet — remove it from the exam page' : undefined}
                          onChange={(e) => setRow(s._id, { on: e.target.checked })}
                        />
                        <span className="font-medium">{s.name}</span>
                        {lock && (
                          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs" title={PAPER_STATUS_LABEL[paper!.status]}>
                            <Lock className="size-3" aria-hidden="true" />
                            {PAPER_STATUS_LABEL[paper!.status]}
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input aria-label={`${s.name} date`} type="date" className="w-36" min={minDate} max={maxDate} disabled={off} value={r.date} onChange={(e) => setRow(s._id, { date: e.target.value })} />
                    </td>
                    <td className={cn('w-28 px-2 py-1.5 text-xs', isSunday(r.date) || clash ? 'text-warning-ink font-medium' : '')}>
                      {r.on && r.date ? weekday(r.date) : ''}
                      {r.on && isSunday(r.date) && <span className="block">Sunday!</span>}
                      {clash && <span className="block">{perDay.get(r.date)} papers</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input aria-label={`${s.name} start time`} type="time" className="w-28" disabled={off} value={r.startTime} onChange={(e) => setRow(s._id, { startTime: e.target.value })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label={`${s.name} max marks`}
                        type="number"
                        min={1}
                        step="0.5"
                        className="w-20"
                        disabled={off}
                        value={r.maxMarks}
                        onChange={(e) =>
                          // Pass marks follow max marks while they're still the 33% default.
                          setRow(s._id, { maxMarks: e.target.value, ...(r.passMarks === passFor(r.maxMarks) ? { passMarks: passFor(e.target.value) } : {}) })
                        }
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        aria-label={`${s.name} pass marks`}
                        type="number"
                        min={0}
                        step="0.5"
                        className="w-20"
                        disabled={off}
                        aria-invalid={r.on && Number(r.passMarks) > Number(r.maxMarks)}
                        value={r.passMarks}
                        onChange={(e) => setRow(s._id, { passMarks: e.target.value })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {subjects.data?.length === 0 && <p className="text-muted-foreground text-xs">Add subjects first, on the Subjects page.</p>}
        {problems.length > 0 && <p className="text-destructive text-xs">{problems[0]}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!classId || editable.length === 0 || problems.length > 0 || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : `Save ${className} date sheet`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
