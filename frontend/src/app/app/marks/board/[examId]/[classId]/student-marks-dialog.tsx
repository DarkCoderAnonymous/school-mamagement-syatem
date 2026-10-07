'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/form/native-select';
import { useSubjectOptions } from '@/hooks/use-school-options';
import { usePermission } from '@/lib/permissions';
import { errorMessage } from '@/lib/form-errors';
import { fullName, marksLabel, PAPER_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getClassSheet, saveDateSheet, saveStudentMarks } from '@/lib/api/exams';
import type { ClassSheet, ClassSheetPaper, ClassSheetRow } from '@/lib/api/types';

/**
 * What was typed in "Obtained marks": a number, "A" for absent, or nothing yet.
 * Typing A keeps the modal to three columns while still recording absence.
 */
type Parsed = { kind: 'empty' } | { kind: 'absent' } | { kind: 'marks'; value: number } | { kind: 'bad'; message: string };

function parse(raw: string, max: number): Parsed {
  const v = raw.trim();
  if (v === '') return { kind: 'empty' };
  if (/^(a|ab|abs|absent)$/i.test(v)) return { kind: 'absent' };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { kind: 'bad', message: 'A number, or A for absent' };
  if (n > max) return { kind: 'bad', message: `Can't be more than ${max}` };
  if (!Number.isInteger(n * 2)) return { kind: 'bad', message: 'Whole or half marks' };
  return { kind: 'marks', value: n };
}

const toEntry = (p: Parsed) => ({ marksObtained: p.kind === 'marks' ? p.value : null, isAbsent: p.kind === 'absent' });

const valuesFor = (row: ClassSheetRow | undefined, papers: ClassSheetPaper[]): Record<string, string> =>
  Object.fromEntries(
    papers.map((p) => {
      const m = row?.marks[p._id];
      return [p._id, m?.isAbsent ? 'A' : m?.marksObtained === null || m?.marksObtained === undefined ? '' : String(m.marksObtained)];
    }),
  );

interface NewSubject {
  key: number;
  subjectId: string;
  total: string;
  obtained: string;
}

/**
 * One student's marks as a modal with three columns — subject, total marks,
 * obtained marks. Papers this person can't enter show locked. Whoever sets
 * up exams can add a subject missing from the class's date sheet in a new
 * row (subject, total, obtained), saved with the rest.
 */
export function StudentMarksDialog({
  sheet,
  index,
  onIndexChange,
}: {
  sheet: ClassSheet;
  index: number | null;
  onIndexChange: (i: number | null) => void;
}) {
  const can = usePermission();
  const queryClient = useQueryClient();
  const canAddSubjects = can(Permission.EXAM_CREATE);
  const subjects = useSubjectOptions(index !== null && canAddSubjects);
  const row = index === null ? undefined : sheet.rows[index];
  const papers = sheet.papers;
  const [values, setValues] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<NewSubject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<number | null | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Load this student's marks when the student (or the class's papers) change — during render, not in an effect.
  const syncKey = `${row?.student._id ?? ''}|${papers.map((p) => p._id).join(',')}`;
  const [synced, setSynced] = useState('');
  if (syncKey !== synced) {
    setSynced(syncKey);
    setValues(valuesFor(row, papers));
    setAdded([]);
    setError(null);
  }

  const saved = valuesFor(row, papers);
  const parsed = new Map(papers.map((p) => [p._id, parse(values[p._id] ?? '', p.maxMarks)]));
  const dirty = papers.filter((p) => p.canEdit && (values[p._id] ?? '').trim().toUpperCase() !== saved[p._id]!.toUpperCase());
  const addedRows = added.filter((a) => a.subjectId || a.total.trim() || a.obtained.trim());
  const addedProblem = addedRows
    .map((a) => {
      const total = Number(a.total);
      if (!a.subjectId) return 'Choose the new subject';
      if (!(total >= 1)) return 'Give the new subject its total marks';
      const p = parse(a.obtained, total);
      return p.kind === 'bad' ? p.message : null;
    })
    .find(Boolean);
  const invalid = papers.some((p) => p.canEdit && parsed.get(p._id)!.kind === 'bad') || Boolean(addedProblem);
  const changed = dirty.length > 0 || addedRows.length > 0;

  const addedMarks = addedRows.reduce((sum, a) => {
    const p = parse(a.obtained, Number(a.total) || 0);
    return sum + (p.kind === 'marks' ? p.value : 0);
  }, 0);
  const obtained = papers.reduce((sum, p) => {
    const v = parsed.get(p._id)!;
    return sum + (v.kind === 'marks' ? v.value : 0);
  }, addedMarks);
  const totalMax = papers.reduce((sum, p) => sum + p.maxMarks, 0) + addedRows.reduce((sum, a) => sum + (Number(a.total) || 0), 0);

  const onSheet = new Set([...papers.map((p) => p.subject._id), ...added.map((a) => a.subjectId).filter(Boolean)]);
  const choicesFor = (a: NewSubject) => (subjects.data ?? []).filter((s) => s._id === a.subjectId || !onSheet.has(s._id));

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['class-sheet', sheet.exam._id, sheet.class._id] });
    void queryClient.invalidateQueries({ queryKey: ['marks-board'] });
    void queryClient.invalidateQueries({ queryKey: ['exam-papers'] });
    void queryClient.invalidateQueries({ queryKey: ['exams'] });
  };

  /** Adds any new subjects to the date sheet, then saves every changed mark in one request. */
  const save = useMutation({
    mutationFn: async () => {
      const entries = dirty.map((p) => ({ examPaperId: p._id, ...toEntry(parsed.get(p._id)!) }));
      if (addedRows.length) {
        await saveDateSheet(
          sheet.exam._id,
          sheet.class._id,
          addedRows.map((a) => ({ subjectId: a.subjectId, date: null, startTime: null, maxMarks: Number(a.total), passMarks: Math.ceil(Number(a.total) * 0.33) })),
        );
        // The new papers' ids, to put this student's marks on them.
        const fresh = await getClassSheet(sheet.exam._id, sheet.class._id);
        for (const a of addedRows) {
          const paper = fresh.papers.find((p) => p.subject._id === a.subjectId);
          const p = parse(a.obtained, Number(a.total));
          if (paper && p.kind !== 'empty') entries.push({ examPaperId: paper._id, ...toEntry(p) });
        }
      }
      if (entries.length) await saveStudentMarks(sheet.exam._id, row!.student._id, entries);
    },
    onError: (e) => setError(errorMessage(e, "Couldn't save the marks")),
  });

  /** Saves if anything changed, then moves to `next` (a row index, or null to close). */
  const go = async (next: number | null) => {
    if (changed) {
      if (invalid) return setError(addedProblem ?? 'Fix the marks in red first');
      setPending(true);
      try {
        await save.mutateAsync();
        toast.success(`${fullName(row!.student)}'s marks saved`);
        await refresh();
      } catch {
        return;
      } finally {
        setPending(false);
      }
    }
    onIndexChange(next);
  };

  const last = sheet.rows.length - 1;
  const onKey = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const nextInput = inputs.current.slice(i + 1).find((el) => el && !el.disabled);
    if (nextInput) nextInput.focus();
    else void go(index !== null && index < last ? index + 1 : index);
  };
  const setAddedRow = (key: number, patch: Partial<NewSubject>) => setAdded((rows) => rows.map((a) => (a.key === key ? { ...a, ...patch } : a)));

  return (
    <>
      <Dialog
        open={index !== null}
        onOpenChange={(o) => {
          if (o) return;
          if (changed) setLeaving(null);
          else onIndexChange(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
          {row && (
            <>
              <DialogHeader>
                <DialogTitle>{fullName(row.student)}</DialogTitle>
                <DialogDescription>
                  {sheet.class.name}
                  {row.student.rollNumber ? ` · Roll ${row.student.rollNumber}` : ''} · {row.student.admissionNumber} · {sheet.exam.name}
                </DialogDescription>
              </DialogHeader>

              {error && (
                <p role="alert" className="bg-destructive-soft text-destructive flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground bg-muted/40 border-b text-left text-xs">
                      <th className="px-3 py-2 font-medium">Subject name</th>
                      <th className="w-28 px-3 py-2 text-right font-medium">Total marks</th>
                      <th className="w-36 px-3 py-2 text-right font-medium">Obtained marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {papers.map((p, i) => {
                      const v = parsed.get(p._id)!;
                      const failing = v.kind === 'marks' && v.value < p.passMarks;
                      return (
                        <tr key={p._id} className="border-b last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-medium">{p.subject.name}</p>
                            {!p.canEdit && (
                              <p className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                                <Lock className="size-3" aria-hidden="true" />
                                {p.status === 'OPEN' ? 'Not your subject' : PAPER_STATUS_LABEL[p.status]}
                              </p>
                            )}
                          </td>
                          <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">{p.maxMarks}</td>
                          <td className="px-3 py-2">
                            <Input
                              ref={(el) => {
                                inputs.current[i] = el;
                              }}
                              aria-label={`${p.subject.name} obtained marks out of ${p.maxMarks}`}
                              className={cn('text-right tabular-nums', failing && 'text-destructive', v.kind === 'absent' && 'text-warning-ink')}
                              placeholder="—"
                              disabled={!p.canEdit}
                              aria-invalid={v.kind === 'bad'}
                              value={values[p._id] ?? ''}
                              onChange={(e) => setValues((cur) => ({ ...cur, [p._id]: e.target.value }))}
                              onKeyDown={onKey(i)}
                            />
                            {v.kind === 'bad' && <p className="text-destructive mt-0.5 text-right text-[0.6875rem]">{v.message}</p>}
                            {v.kind === 'absent' && <p className="text-warning-ink mt-0.5 text-right text-[0.6875rem]">Absent</p>}
                          </td>
                        </tr>
                      );
                    })}
                    {added.map((a) => (
                      <tr key={a.key} className="bg-primary/5 border-b last:border-0">
                        <td className="px-3 py-2">
                          <NativeSelect aria-label="New subject" value={a.subjectId} onChange={(e) => setAddedRow(a.key, { subjectId: e.target.value })}>
                            <option value="">{subjects.isLoading ? 'Loading…' : 'Choose subject…'}</option>
                            {choicesFor(a).map((s) => (
                              <option key={s._id} value={s._id}>
                                {s.name}
                              </option>
                            ))}
                          </NativeSelect>
                        </td>
                        <td className="px-3 py-2">
                          <Input aria-label="New subject total marks" type="number" min={1} step="0.5" className="text-right tabular-nums" value={a.total} onChange={(e) => setAddedRow(a.key, { total: e.target.value })} />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <Input aria-label="New subject obtained marks" className="text-right tabular-nums" placeholder="—" value={a.obtained} onChange={(e) => setAddedRow(a.key, { obtained: e.target.value })} />
                            <Button variant="ghost" size="icon-sm" aria-label="Remove this row" onClick={() => setAdded((rows) => rows.filter((x) => x.key !== a.key))}>
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {papers.length === 0 && added.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-muted-foreground px-3 py-6 text-center text-sm">
                          {sheet.class.name} has no subjects on this date sheet yet{canAddSubjects ? ' — add one below.' : '.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 border-t font-semibold">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{totalMax}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {marksLabel(obtained)}
                        {totalMax > 0 && <span className="text-muted-foreground block text-xs font-normal">{((obtained / totalMax) * 100).toFixed(1)}%</span>}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2">
                {canAddSubjects ? (
                  <Button variant="outline" size="sm" onClick={() => setAdded((rows) => [...rows, { key: Date.now(), subjectId: '', total: '100', obtained: '' }])}>
                    <Plus className="size-3.5" />
                    Add subject
                  </Button>
                ) : (
                  <span />
                )}
                <p className="text-muted-foreground text-xs">Type A for absent · Enter moves down</p>
              </div>

              <DialogFooter className="items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" aria-label="Previous student" disabled={index === 0 || pending} onClick={() => void go((index ?? 1) - 1)}>
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Next student" disabled={index === last || pending} onClick={() => void go((index ?? -1) + 1)}>
                    <ChevronRight className="size-4" />
                  </Button>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {(index ?? 0) + 1} of {sheet.rows.length}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={!changed || invalid || pending} onClick={() => void go(null)}>
                    {pending ? 'Saving…' : 'Save'}
                  </Button>
                  <Button disabled={invalid || pending || index === last} onClick={() => void go((index ?? -1) + 1)}>
                    Save &amp; next
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={leaving !== undefined}
        onOpenChange={(o) => !o && setLeaving(undefined)}
        title="Discard unsaved marks?"
        description={`${row ? fullName(row.student) : 'This student'} has marks that haven't been saved.`}
        confirmLabel="Discard"
        destructive
        onConfirm={() => {
          const next = leaving;
          setLeaving(undefined);
          setValues(valuesFor(row, papers));
          setAdded([]);
          onIndexChange(next ?? null);
        }}
      />
    </>
  );
}
