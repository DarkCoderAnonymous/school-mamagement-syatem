'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { ToggleChip } from '@/components/form/toggle-chip';
import { useClassOptions, useSubjectOptions } from '@/hooks/use-school-options';
import { applyServerError } from '@/lib/form-errors';
import { EXAM_TYPE_LABEL } from '@/lib/labels';
import { examDays, isSunday, weekday } from '@/lib/date-sheet';
import { cn } from '@/lib/utils';
import { createExam, updateExam } from '@/lib/api/exams';
import type { Exam } from '@/lib/api/types';

const schema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(80),
    type: z.enum(['UNIT_TEST', 'MIDTERM', 'FINAL', 'MOCK', 'OTHER']),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    description: z.string().trim().max(300).optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { message: 'The end date is before the start date', path: ['endDate'] });
type Values = z.infer<typeof schema>;

interface SubjectRow {
  on: boolean;
  date: string;
  maxMarks: string;
  passMarks: string;
}

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
/** The customary 33% pass mark, rounded up to a whole mark. */
const passFor = (max: string) => String(Math.ceil(Number(max) * 0.33) || 0);
const blankRow: SubjectRow = { on: false, date: '', maxMarks: '100', passMarks: '33' };

/**
 * Create an exam — and, in the same save, its date sheet: pick the grades,
 * tick their subjects and give each its date (the day is worked out) and
 * marks. Or edit an existing exam's name and dates.
 */
export function ExamDialog({ open, onOpenChange, exam }: { open: boolean; onOpenChange: (o: boolean) => void; exam?: Exam }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const creating = !exam;
  const classes = useClassOptions(open && creating);
  const subjects = useSubjectOptions(open && creating);
  const [classIds, setClassIds] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, SubjectRow>>({});
  const [sheetError, setSheetError] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    form.reset({
      name: exam?.name ?? '',
      type: exam?.type ?? 'MIDTERM',
      startDate: day(exam?.startDate) || today,
      endDate: day(exam?.endDate) || today,
      description: exam?.description ?? '',
    });
  }, [open, exam, form]);
  // The date sheet starts empty each time the dialog opens (adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClassIds([]);
      setRows({});
      setSheetError(null);
    }
  }

  const [startDate, endDate] = useWatch({ control: form.control, name: ['startDate', 'endDate'] });
  const row = (id: string): SubjectRow => rows[id] ?? blankRow;
  const setRow = (id: string, patch: Partial<SubjectRow>) => setRows((r) => ({ ...r, [id]: { ...row(id), ...patch } }));
  const ticked = (subjects.data ?? []).filter((s) => row(s._id).on);
  const perDay = new Map<string, number>();
  for (const s of ticked) if (row(s._id).date) perDay.set(row(s._id).date, (perDay.get(row(s._id).date) ?? 0) + 1);
  const sheetProblem = (() => {
    if (ticked.length > 0 && classIds.length === 0) return 'Pick the grades that sit this date sheet';
    if (classIds.length > 0 && ticked.length === 0) return 'Tick the subjects for the chosen grades';
    for (const s of ticked) {
      const r = row(s._id);
      const max = Number(r.maxMarks);
      const pass = Number(r.passMarks);
      if (!(max >= 1) || !(pass >= 0) || pass > max) return `${s.name}: check the total and pass marks`;
      if (r.date && startDate && endDate && (r.date < startDate || r.date > endDate)) return `${s.name}: the date is outside the exam dates`;
    }
    return null;
  })();

  const fillDates = () => {
    if (!startDate || !endDate) return;
    const days = examDays(startDate, endDate, ticked.length);
    setRows((r) => {
      const next = { ...r };
      ticked.forEach((s, i) => (next[s._id] = { ...(next[s._id] ?? blankRow), date: days[i] ?? '' }));
      return next;
    });
    if (days.length < ticked.length) toast.warning(`Only ${days.length} exam days (Sundays off) — ${ticked.length - days.length} subjects still need a date`);
  };

  const mutation = useMutation({
    mutationFn: (v: Values) => {
      if (exam) return updateExam(exam._id, v);
      const withSheet = classIds.length > 0 && ticked.length > 0;
      return createExam({
        ...v,
        ...(withSheet
          ? {
              dateSheet: {
                classIds,
                papers: ticked.map((s) => {
                  const r = row(s._id);
                  return { subjectId: s._id, date: r.date || null, startTime: null, maxMarks: Number(r.maxMarks), passMarks: Number(r.passMarks) };
                }),
              },
            }
          : {}),
      });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['exams'] });
      void queryClient.invalidateQueries({ queryKey: ['marks-board'] });
      const papers = saved.papers?.length ?? 0;
      toast.success(exam ? 'Exam updated' : `${saved.name} created`, {
        description: exam ? undefined : papers ? `Date sheet made — ${papers} papers.` : 'Now make each grade’s date sheet.',
      });
      onOpenChange(false);
      if (!exam) router.push(`/app/exams/${saved._id}${papers ? '' : '?datesheet=1'}`);
    },
    onError: (e) => applyServerError(e, form.setError, ['name', 'startDate', 'endDate'], "Couldn't save the exam"),
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('max-h-[92vh] overflow-y-auto', creating ? 'sm:max-w-3xl' : 'sm:max-w-md')}>
        <DialogHeader>
          <DialogTitle>{exam ? 'Edit exam' : 'New exam'}</DialogTitle>
          <DialogDescription>
            {creating ? 'Name the exam or test, then pick the grades and give each subject its date.' : 'Papers must fall between these dates.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={form.handleSubmit((v) => {
            setSheetError(null);
            if (creating && sheetProblem) return setSheetError(sheetProblem);
            return mutation.mutateAsync(v).catch(() => undefined);
          })}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <Field label="Name" error={errors.name?.message} required>
              {({ id, describedBy }) => <Input id={id} autoFocus placeholder="e.g. Mid-term 2026, Monthly test — October" aria-describedby={describedBy} aria-invalid={!!errors.name} {...form.register('name')} />}
            </Field>
            <Field label="Type">
              {({ id }) => (
                <NativeSelect id={id} {...form.register('type')}>
                  {Object.entries(EXAM_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" error={errors.startDate?.message} required>
              {({ id, describedBy }) => <Input id={id} type="date" aria-describedby={describedBy} {...form.register('startDate')} />}
            </Field>
            <Field label="Ends" error={errors.endDate?.message} required>
              {({ id, describedBy }) => <Input id={id} type="date" aria-describedby={describedBy} aria-invalid={!!errors.endDate} {...form.register('endDate')} />}
            </Field>
          </div>
          {!creating && (
            <Field label="Notes" help="Optional — shown to staff only.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...form.register('description')} />}
            </Field>
          )}

          {creating && (
            <>
              <fieldset className="space-y-2">
                <legend className="flex w-full items-center justify-between text-[0.8125rem] font-medium">
                  Grades
                  {(classes.data?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      className="text-primary text-xs font-normal hover:underline"
                      onClick={() => setClassIds(classIds.length === classes.data!.length ? [] : classes.data!.map((c) => c._id))}
                    >
                      {classIds.length === classes.data?.length ? 'Clear all' : 'Select all'}
                    </button>
                  )}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {classes.data?.map((c) => (
                    <ToggleChip key={c._id} on={classIds.includes(c._id)} onClick={() => setClassIds((ids) => (ids.includes(c._id) ? ids.filter((x) => x !== c._id) : [...ids, c._id]))}>
                      {c.name}
                    </ToggleChip>
                  ))}
                  {classes.data?.length === 0 && <p className="text-muted-foreground text-xs">Add grades first, on the Classes page.</p>}
                </div>
                <p className="text-muted-foreground text-xs">Every grade picked sits the same date sheet. Grades on a different schedule can be added from the exam page later.</p>
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="flex w-full items-center justify-between text-[0.8125rem] font-medium">
                  Date sheet
                  <Button type="button" variant="outline" size="sm" onClick={fillDates} disabled={ticked.length === 0}>
                    <CalendarDays className="size-3.5" />
                    Fill dates
                  </Button>
                </legend>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b text-left text-xs">
                        <th className="px-3 py-2 font-medium">Subject</th>
                        <th className="px-2 py-2 font-medium">Date</th>
                        <th className="px-2 py-2 font-medium">Day</th>
                        <th className="px-2 py-2 font-medium">Total marks</th>
                        <th className="px-2 py-2 font-medium">Pass marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subjects.data?.map((s) => {
                        const r = row(s._id);
                        const clash = r.on && r.date && (perDay.get(r.date) ?? 0) > 1;
                        return (
                          <tr key={s._id} className={cn('border-b last:border-0', !r.on && 'text-muted-foreground')}>
                            <td className="px-3 py-1.5">
                              <label className="flex items-center gap-2.5">
                                <input type="checkbox" className="accent-primary size-4" checked={r.on} onChange={(e) => setRow(s._id, { on: e.target.checked })} />
                                <span className="font-medium">{s.name}</span>
                              </label>
                            </td>
                            <td className="px-2 py-1.5">
                              <Input aria-label={`${s.name} date`} type="date" className="w-36" min={startDate} max={endDate} disabled={!r.on} value={r.date} onChange={(e) => setRow(s._id, { date: e.target.value })} />
                            </td>
                            <td className={cn('w-28 px-2 py-1.5 text-xs', (isSunday(r.date) || clash) && 'text-warning-ink font-medium')}>
                              {r.on && r.date ? weekday(r.date) : ''}
                              {clash && <span className="block">{perDay.get(r.date)} papers</span>}
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                aria-label={`${s.name} total marks`}
                                type="number"
                                min={1}
                                step="0.5"
                                className="w-20"
                                disabled={!r.on}
                                value={r.maxMarks}
                                // Pass marks follow the total while they're still the 33% default.
                                onChange={(e) => setRow(s._id, { maxMarks: e.target.value, ...(r.passMarks === passFor(r.maxMarks) ? { passMarks: passFor(e.target.value) } : {}) })}
                              />
                            </td>
                            <td className="px-2 py-1.5">
                              <Input
                                aria-label={`${s.name} pass marks`}
                                type="number"
                                min={0}
                                step="0.5"
                                className="w-20"
                                disabled={!r.on}
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
              </fieldset>
            </>
          )}

          {sheetError && (
            <p role="alert" className="text-destructive text-sm">
              {sheetError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : exam ? 'Save' : classIds.length && ticked.length ? `Create exam · ${classIds.length * ticked.length} papers` : 'Create exam'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
