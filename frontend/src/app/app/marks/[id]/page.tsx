'use client';

import { Suspense, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, CheckCircle2, CloudUpload, Info, Lock, RotateCcw, Send, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, marksLabel, PAPER_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getExamSettings, getMarksSheet, returnPaper, saveMarks, submitPaper, verifyPaper } from '@/lib/api/exams';
import type { GradingBand, MarksSheet } from '@/lib/api/types';
import { StudentLink } from '@/components/students/student-quick-view';
import { resultsTabFor } from '@/components/students/student-records';

interface Draft {
  marks: string;
  isAbsent: boolean;
  remarks: string;
}

const AUTOSAVE_MS = 1200;

function problem(d: Draft | undefined, max: number): string | null {
  if (!d || d.isAbsent || d.marks.trim() === '') return null;
  const n = Number(d.marks);
  if (!Number.isFinite(n) || n < 0) return 'Not a number';
  if (n > max) return `Max is ${max}`;
  if (!Number.isInteger(n * 2)) return 'Whole or half marks';
  return null;
}

const hasValue = (d: Draft | undefined) => Boolean(d && (d.isAbsent || d.marks.trim() !== ''));

function gradeOf(marks: number, max: number, bands: GradingBand[]): string {
  const pct = (marks / max) * 100;
  return bands.find((b) => pct >= b.minPercent)?.grade ?? '—';
}

function Sheet({ id }: { id: string }) {
  const url = useUrlState();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const office = can(Permission.EXAM_MARKS_PUBLISH);
  const sheetKey = useMemo(() => ['marks-sheet', id], [id]);
  // No refetch on focus: a background refetch must never overwrite marks being typed.
  const sheet = useQuery({ queryKey: sheetKey, queryFn: () => getMarksSheet(id), refetchOnWindowFocus: false });
  const settings = useQuery({ queryKey: ['exam-settings'], queryFn: getExamSettings, staleTime: 300_000 });

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  /** studentId → edit version, so a save only clears rows that didn't change again while it was in flight. */
  const [dirty, setDirty] = useState<Record<string, number>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'submit' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const dirtyCount = Object.keys(dirty).length;

  // Load the server's marks into the grid (during render, not in an effect) — never over unsaved edits.
  const [synced, setSynced] = useState<MarksSheet | undefined>(undefined);
  if (sheet.data && sheet.data !== synced && dirtyCount === 0) {
    setSynced(sheet.data);
    setDrafts(
      Object.fromEntries(
        sheet.data.rows.map((r) => [r.student._id, { marks: r.marksObtained === null ? '' : String(r.marksObtained), isAbsent: r.isAbsent, remarks: r.remarks ?? '' }]),
      ),
    );
  }

  const data = sheet.data;
  const paper = data?.paper;
  const max = paper?.maxMarks ?? 100;
  const canEdit = Boolean(data?.canEdit);

  const save = useMutation({
    mutationFn: (entries: { studentId: string; marksObtained: number | null; isAbsent: boolean; remarks?: string }[]) => saveMarks(id, entries),
  });
  const { mutate: runSave, isPending: saving } = save;

  const flush = useCallback(() => {
    if (!canEdit || saving) return;
    const ids = Object.keys(dirty).filter((sid) => !problem(drafts[sid], max));
    if (ids.length === 0) return;
    const versions = Object.fromEntries(ids.map((sid) => [sid, dirty[sid]]));
    const entries = ids.map((sid) => {
      const d = drafts[sid]!;
      return {
        studentId: sid,
        marksObtained: d.isAbsent || d.marks.trim() === '' ? null : Number(d.marks),
        isAbsent: d.isAbsent,
        remarks: d.remarks.trim() || undefined,
      };
    });
    runSave(entries, {
      onSuccess: (res) => {
        setSaveError(null);
        setSavedAt(res.savedAt);
        setDirty((cur) => {
          const next = { ...cur };
          for (const sid of ids) if (next[sid] === versions[sid]) delete next[sid];
          return next;
        });
        // Keep the cached sheet in step with what's now stored, so a later re-sync can't revert it.
        queryClient.setQueryData<MarksSheet>(sheetKey, (old) =>
          old
            ? {
                ...old,
                enteredCount: res.enteredCount,
                rows: old.rows.map((r) => {
                  const e = entries.find((x) => x.studentId === r.student._id);
                  return e ? { ...r, marksObtained: e.marksObtained, isAbsent: e.isAbsent, remarks: e.remarks ?? '' } : r;
                }),
              }
            : old,
        );
        void queryClient.invalidateQueries({ queryKey: ['exam-papers'] });
        void queryClient.invalidateQueries({ queryKey: ['exams'] });
      },
      onError: (e) => setSaveError(errorMessage(e, "Couldn't save marks")),
    });
  }, [canEdit, saving, dirty, drafts, max, runSave, queryClient, sheetKey]);

  // Autosave: a short pause after the last keystroke saves every changed, valid row.
  useEffect(() => {
    if (dirtyCount === 0 || saving || saveError) return;
    const timer = setTimeout(flush, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [drafts, dirtyCount, saving, saveError, flush]);

  // Don't let unsaved marks vanish with the tab.
  useEffect(() => {
    if (dirtyCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyCount]);

  const edit = (sid: string, patch: Partial<Draft>) => {
    setDrafts((d) => ({ ...d, [sid]: { ...(d[sid] ?? { marks: '', isAbsent: false, remarks: '' }), ...patch } }));
    setDirty((d) => ({ ...d, [sid]: (d[sid] ?? 0) + 1 }));
    setSaveError(null);
  };

  const workflow = useMutation({
    mutationFn: async (kind: 'submit' | 'verify' | 'return') =>
      kind === 'submit' ? submitPaper(id) : kind === 'verify' ? verifyPaper(id) : returnPaper(id, reason),
    onSuccess: async (_r, kind) => {
      setConfirm(null);
      setReason('');
      await queryClient.invalidateQueries({ queryKey: sheetKey });
      void queryClient.invalidateQueries({ queryKey: ['exam-papers'] });
      void queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast.success({ submit: 'Submitted for verification', verify: 'Paper verified', return: 'Returned to the teacher' }[kind]);
    },
    onError: (e) => {
      setConfirm(null);
      toast.error(errorMessage(e, 'That didn’t work'));
    },
  });

  const section = url.get('section');
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !section || r.student.sectionId === section), [data, section]);
  const allRows = data?.rows ?? [];
  const entered = allRows.filter((r) => hasValue(drafts[r.student._id])).length;
  const scores = allRows
    .map((r) => drafts[r.student._id])
    .filter((d): d is Draft => Boolean(d && !d.isAbsent && d.marks.trim() !== '' && !problem(d, max)))
    .map((d) => Number(d.marks));
  const average = scores.length ? scores.reduce((s, n) => s + n, 0) / scores.length : null;
  const belowPass = scores.filter((n) => n < (paper?.passMarks ?? 0)).length;
  const invalidCount = allRows.filter((r) => problem(drafts[r.student._id], max)).length;
  const complete = allRows.length > 0 && entered === allRows.length;

  if (sheet.isLoading) return <Skeleton className="h-[32rem] w-full rounded-xl" />;
  if (sheet.isError || !data || !paper) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={sheet.error} onRetry={() => void sheet.refetch()} title="Couldn't load this marks sheet" />
      </div>
    );
  }

  const focusRow = (i: number) => {
    const el = inputs.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  };
  const bands = settings.data?.gradingBands ?? [];
  const examId = paper.examId?._id;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${paper.subjectId?.name} — ${paper.classId?.name}`}
        description={`${paper.examId?.name} · Max ${paper.maxMarks}, pass ${paper.passMarks}${paper.date ? ` · ${fmt.date(paper.date)}` : ''}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Marks entry', href: '/app/marks' },
          { label: `${paper.subjectId?.name} · ${paper.classId?.name}` },
        ]}
        meta={<div className="pt-1"><StatusBadge status={paper.status} label={PAPER_STATUS_LABEL[paper.status]} /></div>}
        action={
          <>
            {examId && (
              <Link href={`/app/exams/${examId}`} className="text-muted-foreground hover:text-foreground px-2 text-sm">
                Date sheet
              </Link>
            )}
            {office && (paper.status === 'SUBMITTED' || paper.status === 'VERIFIED') && (
              <Button variant="outline" onClick={() => setConfirm('return')}>
                <Undo2 className="size-4" />
                Return
              </Button>
            )}
            {office && paper.status === 'SUBMITTED' && (
              <Button onClick={() => workflow.mutate('verify')} disabled={workflow.isPending}>
                <CheckCircle2 className="size-4" />
                Verify
              </Button>
            )}
            {canEdit && (
              <Button onClick={() => setConfirm('submit')} disabled={!complete || dirtyCount > 0 || invalidCount > 0 || saving}>
                <Send className="size-4" />
                Submit
              </Button>
            )}
          </>
        }
      />

      {paper.status === 'OPEN' && paper.returnReason && (
        <Banner tone="warning" icon={AlertTriangle}>
          Returned by the exam office: <span className="font-medium">{paper.returnReason}</span>
        </Banner>
      )}
      {paper.status === 'SUBMITTED' && (
        <Banner tone="info" icon={Info}>
          Submitted {paper.submittedAt ? fmt.date(paper.submittedAt, true) : ''}
          {paper.submittedByUserId ? ` by ${fullName(paper.submittedByUserId)}` : ''} — waiting for verification.
          {!office && ' Ask the exam office to return it if something needs changing.'}
        </Banner>
      )}
      {paper.status === 'VERIFIED' && (
        <Banner tone="success" icon={CheckCircle2}>
          Verified{paper.verifiedByUserId ? ` by ${fullName(paper.verifiedByUserId)}` : ''}. Marks are final once results are published.
        </Banner>
      )}
      {paper.status === 'PUBLISHED' && (
        <Banner tone="neutral" icon={Lock}>
          Results are published — these marks are locked.
        </Banner>
      )}
      {paper.status === 'OPEN' && !canEdit && (
        <Banner tone="neutral" icon={Info}>
          Read-only: this subject isn&apos;t on your teacher profile.
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Marks entered" value={`${entered}/${allRows.length}`} tone={complete ? 'success' : undefined} />
        <Stat label="Class average" value={average === null ? '—' : `${marksLabel(average)} / ${max}`} />
        <Stat label="Highest" value={scores.length ? `${marksLabel(Math.max(...scores))} / ${max}` : '—'} />
        <Stat label="Below pass mark" value={String(belowPass)} tone={belowPass ? 'danger' : undefined} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {data.sections.length > 1 ? (
          <Tabs value={section ?? 'all'} onValueChange={(v) => url.set({ section: v === 'all' ? undefined : String(v) })}>
            <TabsList>
              <TabsTrigger value="all">All sections</TabsTrigger>
              {data.sections.map((s) => (
                <TabsTrigger key={s._id} value={s._id}>
                  Section {s.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        ) : (
          <span />
        )}
        {canEdit && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs" aria-live="polite">
            {saveError ? (
              <span className="text-destructive flex items-center gap-1.5">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                {saveError}
                <button type="button" className="text-primary ml-1 inline-flex items-center gap-1 hover:underline" onClick={() => { setSaveError(null); flush(); }}>
                  <RotateCcw className="size-3" aria-hidden="true" />
                  Retry
                </button>
              </span>
            ) : saving ? (
              <>
                <CloudUpload className="size-3.5 animate-pulse" aria-hidden="true" />
                Saving…
              </>
            ) : dirtyCount > 0 ? (
              invalidCount > 0 ? `${invalidCount} mark${invalidCount === 1 ? ' needs' : 's need'} fixing before it can save` : 'Unsaved changes'
            ) : savedAt ? (
              <>
                <Check className="text-success size-3.5" aria-hidden="true" />
                All changes saved
              </>
            ) : (
              'Changes save automatically. Enter or ↓ for the next student, “a” for absent.'
            )}
          </p>
        )}
      </div>

      <div className="bg-card overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="w-14 px-4 py-2.5 font-medium">Roll</th>
              <th className="px-3 py-2.5 font-medium">Student</th>
              <th className="w-40 px-3 py-2.5 font-medium">Marks / {max}</th>
              <th className="w-20 px-3 py-2.5 font-medium">Grade</th>
              <th className="w-24 px-3 py-2.5 font-medium">Absent</th>
              <th className="px-4 py-2.5 font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody className="rows-stagger">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground px-4 py-10 text-center">
                  No active students in this {section ? 'section' : 'class'}.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const sid = r.student._id;
              const d = drafts[sid] ?? { marks: '', isAbsent: false, remarks: '' };
              const err = problem(d, max);
              const n = Number(d.marks);
              const scored = !d.isAbsent && d.marks.trim() !== '' && !err;
              const failing = scored && n < paper.passMarks;
              return (
                <tr key={sid} className={cn('border-b transition-colors last:border-0', dirty[sid] !== undefined ? 'bg-primary/[0.03]' : 'hover:bg-muted/40')}>
                  <td className="text-muted-foreground px-4 py-2 tabular-nums">{r.student.rollNumber ?? '—'}</td>
                  <td className="px-3 py-2">
                    <StudentLink studentId={r.student._id} tab={resultsTabFor(paper.examId?.type)} className="font-medium">
                      {fullName(r.student)}
                    </StudentLink>
                    <p className="text-muted-foreground font-mono text-xs">{r.student.admissionNumber}</p>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      aria-label={`Marks for ${fullName(r.student)}`}
                      aria-invalid={Boolean(err)}
                      inputMode="decimal"
                      disabled={!canEdit || d.isAbsent}
                      placeholder={d.isAbsent ? 'AB' : '—'}
                      value={d.isAbsent ? '' : d.marks}
                      className={cn('h-9 w-24 text-right tabular-nums', failing && 'text-destructive')}
                      onChange={(e) => edit(sid, { marks: e.target.value.replace(/[^\d.]/g, '') })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowDown') {
                          e.preventDefault();
                          focusRow(i + 1);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          focusRow(i - 1);
                        } else if (e.key.toLowerCase() === 'a') {
                          e.preventDefault();
                          edit(sid, { isAbsent: true, marks: '' });
                          focusRow(i + 1);
                        }
                      }}
                    />
                    {err && <p className="text-destructive mt-1 text-xs">{err}</p>}
                  </td>
                  <td className="px-3 py-2">
                    {d.isAbsent ? (
                      <span className="text-muted-foreground text-xs font-medium">AB</span>
                    ) : scored && bands.length ? (
                      <span className={cn('text-sm font-semibold', failing ? 'text-destructive' : 'text-foreground')}>{gradeOf(n, max, bands)}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        className="accent-primary size-4"
                        disabled={!canEdit}
                        checked={d.isAbsent}
                        onChange={(e) => edit(sid, { isAbsent: e.target.checked, marks: e.target.checked ? '' : d.marks })}
                      />
                      Absent
                    </label>
                  </td>
                  <td className="px-4 py-2">
                    <Input
                      aria-label={`Remarks for ${fullName(r.student)}`}
                      disabled={!canEdit}
                      value={d.remarks}
                      maxLength={200}
                      placeholder={canEdit ? 'Optional' : ''}
                      className="h-9 min-w-40"
                      onChange={(e) => edit(sid, { remarks: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {canEdit && !complete && (
        <p className="text-muted-foreground text-xs">
          Submit unlocks once every student has a mark or is marked absent ({allRows.length - entered} to go).
        </p>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setReason('');
          }
        }}
        title={confirm === 'submit' ? 'Submit these marks?' : 'Return this paper for changes?'}
        description={
          confirm === 'submit'
            ? 'The exam office checks and verifies them. You can’t change marks after submitting unless the paper is returned to you.'
            : 'Marks entry reopens for the teacher, who sees your note.'
        }
        confirmLabel={confirm === 'submit' ? 'Submit' : 'Return paper'}
        pending={workflow.isPending}
        onConfirm={() => {
          if (confirm === 'return' && reason.trim().length < 3) {
            toast.error('Give a reason (3+ characters)');
            return;
          }
          if (confirm) workflow.mutate(confirm);
        }}
      >
        {confirm === 'return' && (
          <Input aria-label="Reason" autoFocus placeholder="Note for the teacher, e.g. re-check roll 12" value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </ConfirmDialog>
    </div>
  );
}

function Banner({ tone, icon: Icon, children }: { tone: 'info' | 'warning' | 'success' | 'neutral'; icon: typeof Info; children: React.ReactNode }) {
  const cls = {
    info: 'bg-info-soft text-info',
    warning: 'bg-warning-soft text-warning-ink',
    success: 'bg-success-soft text-success',
    neutral: 'bg-muted text-muted-foreground',
  }[tone];
  return (
    <p className={cn('animate-fade-up flex items-start gap-2 rounded-lg px-4 py-3 text-sm', cls)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  return (
    <div className="bg-card rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn('text-lg font-semibold tabular-nums', tone === 'success' && 'text-success', tone === 'danger' && 'text-destructive')}>{value}</p>
    </div>
  );
}

export default function MarksSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={null}>
      <Sheet id={id} />
    </Suspense>
  );
}
