'use client';

import { use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, CalendarDays, CheckCircle2, ClipboardList, MoreHorizontal, Pencil, Printer, Send, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/form/field';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { EXAM_STATUS_LABEL, EXAM_TYPE_LABEL, PAPER_STATUS_LABEL } from '@/lib/labels';
import { weekday } from '@/lib/date-sheet';
import { cn } from '@/lib/utils';
import { deleteExam, deletePaper, getExam, publishResults, returnPaper, updatePaper, verifyPaper, withdrawResults } from '@/lib/api/exams';
import type { ExamPaper } from '@/lib/api/types';
import { ExamDialog } from '../exam-dialog';
import { AddPapersDialog } from './add-papers-dialog';
import { DateSheetDialog } from './date-sheet-dialog';

type ClassGroup = { classId: string; className: string; papers: ExamPaper[] };
type Pending =
  | { kind: 'publish'; group: ClassGroup }
  | { kind: 'withdraw'; group: ClassGroup }
  | { kind: 'return'; paper: ExamPaper }
  | { kind: 'deletePaper'; paper: ExamPaper }
  | { kind: 'deleteExam' };

export default function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const url = useUrlState();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  // `?datesheet=1` (straight after creating the exam) opens the date sheet builder.
  const [dateSheet, setDateSheet] = useState<{ classId?: string } | null>(url.get('datesheet') ? {} : null);
  const [editingExam, setEditingExam] = useState(false);
  const [editingPaper, setEditingPaper] = useState<ExamPaper>();
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState('');
  const query = useQuery({ queryKey: ['exams', id], queryFn: () => getExam(id) });

  const groups = useMemo<ClassGroup[]>(() => {
    const map = new Map<string, ClassGroup>();
    for (const p of query.data?.papers ?? []) {
      const key = p.classId?._id ?? 'none';
      const g = map.get(key) ?? { classId: key, className: p.classId?.name ?? 'Class', papers: [] };
      g.papers.push(p);
      map.set(key, g);
    }
    return [...map.values()];
  }, [query.data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['exams'] });
  const act = useMutation({
    mutationFn: async (p: Pending | { kind: 'verify'; paper: ExamPaper }) => {
      switch (p.kind) {
        case 'publish':
          return publishResults(id, [p.group.classId]);
        case 'withdraw':
          return withdrawResults(id, p.group.classId, reason);
        case 'return':
          return returnPaper(p.paper._id, reason);
        case 'verify':
          return verifyPaper(p.paper._id);
        case 'deletePaper':
          return deletePaper(p.paper._id);
        case 'deleteExam':
          return deleteExam(id);
      }
    },
    onSuccess: async (res, p) => {
      setPending(null);
      setReason('');
      if (p.kind === 'deleteExam') {
        toast.success('Exam deleted');
        await queryClient.invalidateQueries({ queryKey: ['exams'] });
        router.replace('/app/exams');
        return;
      }
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['exam-results'] });
      if (p.kind === 'publish') {
        const r = res as { classes: { students: number; passed: number }[]; notified: number };
        const c = r.classes[0];
        toast.success(`${p.group.className} results published`, {
          description: c ? `${c.passed} of ${c.students} passed. ${r.notified} families emailed.` : undefined,
        });
      } else {
        toast.success(
          { withdraw: 'Results withdrawn — papers are back to verified', return: 'Paper returned for marks entry', verify: 'Paper verified', deletePaper: 'Paper removed' }[
            p.kind
          ],
        );
      }
    },
    onError: (e) => {
      toast.error(errorMessage(e, 'That didn’t work'));
      setPending(null);
    },
  });

  if (query.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this exam" />
      </div>
    );
  }
  const exam = query.data;
  const canPublish = can(Permission.EXAM_MARKS_PUBLISH);
  const canSetUp = can(Permission.EXAM_CREATE);
  const needsReason = pending?.kind === 'withdraw' || pending?.kind === 'return';

  return (
    <div className="space-y-6">
      <PageHeader
        title={exam.name}
        description={`${EXAM_TYPE_LABEL[exam.type]} · ${fmt.date(exam.startDate)} – ${fmt.date(exam.endDate)}${exam.academicSessionId ? ` · ${exam.academicSessionId.name}` : ''}`}
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Exams', href: '/app/exams' }, { label: exam.name }]}
        meta={<div className="pt-1"><StatusBadge status={exam.status} label={EXAM_STATUS_LABEL[exam.status]} /></div>}
        action={
          <>
            {groups.length > 0 && (
              <Link href={`/app/exams/${exam._id}/date-sheet`} className={buttonVariants({ variant: 'outline' })}>
                <Printer className="size-4" />
                Print date sheets
              </Link>
            )}
            {(exam.paperCounts.PUBLISHED ?? 0) > 0 && (
              <Link href={`/app/results?examId=${exam._id}`} className={buttonVariants({ variant: 'outline' })}>
                <Award className="size-4" />
                Results
              </Link>
            )}
            <PermissionGate permission={Permission.EXAM_CREATE}>
              <DropdownMenu>
                <DropdownMenuTrigger className={buttonVariants({ variant: 'ghost', size: 'icon' })} aria-label="More exam actions">
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setAdding(true)}>Add papers to many classes</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEditingExam(true)}>Edit name and dates</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setPending({ kind: 'deleteExam' })}>Delete exam</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => setDateSheet({})}>
                <CalendarDays className="size-4" />
                Make date sheet
              </Button>
            </PermissionGate>
          </>
        }
      />

      {groups.length === 0 && (
        <div className="bg-card rounded-xl border">
          <EmptyState
            icon={ClipboardList}
            title="No date sheet yet"
            description="Make each class's date sheet — its subjects, the date and day of each paper, and their max and pass marks."
            action={
              canSetUp ? (
                <Button onClick={() => setDateSheet({})}>
                  <CalendarDays className="size-4" />
                  Make date sheet
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {groups.map((g, gi) => {
        const verified = g.papers.every((p) => p.status === 'VERIFIED');
        const published = g.papers.some((p) => p.status === 'PUBLISHED');
        const done = g.papers.filter((p) => p.status === 'VERIFIED' || p.status === 'PUBLISHED').length;
        return (
          <section key={g.classId} className="bg-card animate-fade-up overflow-hidden rounded-xl border" style={{ ['--delay' as string]: `${gi * 50}ms` }}>
            <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">{g.className}</h2>
                <p className="text-muted-foreground text-xs">
                  {g.papers.length} paper{g.papers.length === 1 ? '' : 's'} · {done} verified{published ? ' · results published' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canSetUp && !published && (
                  <Button variant="outline" size="sm" onClick={() => setDateSheet({ classId: g.classId })}>
                    <CalendarDays className="size-3.5" />
                    Date sheet
                  </Button>
                )}
                <Link href={`/app/exams/${exam._id}/date-sheet?classId=${g.classId}`} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  <Printer className="size-3.5" />
                  Print
                </Link>
                {published && (
                  <>
                    <Link href={`/app/results?examId=${exam._id}&classId=${g.classId}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      <Award className="size-3.5" />
                      View results
                    </Link>
                    {canPublish && (
                      <Button variant="ghost" size="sm" onClick={() => setPending({ kind: 'withdraw', group: g })}>
                        <Undo2 className="size-3.5" />
                        Withdraw
                      </Button>
                    )}
                  </>
                )}
                {!published && canPublish && (
                  <Button size="sm" disabled={!verified} onClick={() => setPending({ kind: 'publish', group: g })} title={verified ? undefined : 'Every paper must be verified first'}>
                    <Send className="size-3.5" />
                    Publish results
                  </Button>
                )}
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="px-5 py-2 font-medium">Subject</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Day</th>
                    <th className="px-3 py-2 font-medium">Max / pass</th>
                    <th className="px-3 py-2 font-medium">Marks entered</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-5 py-2" />
                  </tr>
                </thead>
                <tbody className="rows-stagger">
                  {g.papers.map((p) => {
                    const entered = p.marksEntered ?? 0;
                    const total = p.classStrength ?? 0;
                    return (
                      <tr key={p._id} className="hover:bg-muted/40 border-b transition-colors last:border-0">
                        <td className="px-5 py-2.5">
                          <Link href={`/app/marks/${p._id}`} className="hover:text-primary font-medium">
                            {p.subjectId?.name}
                          </Link>
                          <span className="text-muted-foreground ml-2 font-mono text-xs">{p.subjectId?.code}</span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {p.date ? fmt.date(p.date) : <span className="text-muted-foreground">Not set</span>}
                          {p.startTime && <span className="text-muted-foreground text-xs"> · {p.startTime}</span>}
                        </td>
                        <td className="px-3 py-2.5">{weekday(p.date) || <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-3 py-2.5 tabular-nums">
                          {p.maxMarks} / {p.passMarks}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="bg-muted h-1.5 w-16 overflow-hidden rounded-full" aria-hidden="true">
                              <span
                                className={cn('block h-full origin-left transition-transform', entered >= total && total > 0 ? 'bg-success' : 'bg-primary')}
                                style={{ transform: `scaleX(${total ? entered / total : 0})` }}
                              />
                            </span>
                            <span className="text-muted-foreground text-xs tabular-nums">
                              {entered}/{total}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={p.status} label={PAPER_STATUS_LABEL[p.status]} />
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex justify-end gap-1">
                            {p.status === 'SUBMITTED' && canPublish && (
                              <Button size="sm" variant="outline" onClick={() => act.mutate({ kind: 'verify', paper: p })} disabled={act.isPending}>
                                <CheckCircle2 className="size-3.5" />
                                Verify
                              </Button>
                            )}
                            {(p.status === 'SUBMITTED' || p.status === 'VERIFIED') && canPublish && (
                              <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'return', paper: p })}>
                                Return
                              </Button>
                            )}
                            {p.status === 'OPEN' && canSetUp && (
                              <>
                                <Button size="icon-sm" variant="ghost" aria-label={`Edit ${p.subjectId?.name} paper`} onClick={() => setEditingPaper(p)}>
                                  <Pencil className="size-3.5" />
                                </Button>
                                {entered === 0 && (
                                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${p.subjectId?.name} paper`} onClick={() => setPending({ kind: 'deletePaper', paper: p })}>
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <AddPapersDialog exam={exam} open={adding} onOpenChange={setAdding} />
      <DateSheetDialog
        exam={exam}
        classId={dateSheet?.classId}
        open={Boolean(dateSheet)}
        onOpenChange={(o) => {
          if (o) return;
          setDateSheet(null);
          if (url.get('datesheet')) url.set({ datesheet: undefined });
        }}
      />
      <ExamDialog open={editingExam} onOpenChange={setEditingExam} exam={exam} />
      <PaperDialog paper={editingPaper} examStart={exam.startDate} examEnd={exam.endDate} onClose={() => setEditingPaper(undefined)} onSaved={refresh} />
      <ConfirmDialog
        open={Boolean(pending)}
        onOpenChange={(o) => {
          if (!o) {
            setPending(null);
            setReason('');
          }
        }}
        title={
          pending?.kind === 'publish'
            ? `Publish ${pending.group.className} results?`
            : pending?.kind === 'withdraw'
              ? `Withdraw ${pending.group.className} results?`
              : pending?.kind === 'return'
                ? `Return ${pending.paper.subjectId?.name} for changes?`
                : pending?.kind === 'deletePaper'
                  ? `Remove the ${pending.paper.subjectId?.name} paper?`
                  : `Delete ${exam.name}?`
        }
        description={
          pending?.kind === 'publish'
            ? 'Grades, totals and positions are worked out now and marks are locked. Families with an email on file are told the results are out.'
            : pending?.kind === 'withdraw'
              ? 'Report cards come down and the papers go back to verified, so one can be returned to its teacher. Publish again when fixed.'
              : pending?.kind === 'return'
                ? 'The teacher can change marks again, and sees your note.'
                : pending?.kind === 'deletePaper'
                  ? 'It comes off the date sheet. No marks have been entered on it.'
                  : 'Only possible while no marks have been entered. The date sheet goes with it.'
        }
        confirmLabel={
          pending?.kind === 'publish' ? 'Publish' : pending?.kind === 'withdraw' ? 'Withdraw results' : pending?.kind === 'return' ? 'Return paper' : 'Delete'
        }
        destructive={pending?.kind === 'withdraw' || pending?.kind === 'deletePaper' || pending?.kind === 'deleteExam'}
        pending={act.isPending}
        onConfirm={() => {
          if (!pending) return;
          if (needsReason && reason.trim().length < 3) {
            toast.error('Give a reason (3+ characters)');
            return;
          }
          act.mutate(pending);
        }}
      >
        {needsReason && (
          <Input
            aria-label="Reason"
            autoFocus
            placeholder={pending?.kind === 'return' ? 'Note for the teacher, e.g. re-check roll 12' : 'Reason, e.g. wrong maths marks'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}

function PaperDialog({
  paper,
  examStart,
  examEnd,
  onClose,
  onSaved,
}: {
  paper?: ExamPaper;
  examStart: string;
  examEnd: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [values, setValues] = useState({ date: '', startTime: '', maxMarks: '', passMarks: '' });
  const [synced, setSynced] = useState<ExamPaper | undefined>(undefined);
  if (paper !== synced) {
    setSynced(paper);
    if (paper) {
      setValues({ date: paper.date?.slice(0, 10) ?? '', startTime: paper.startTime ?? '', maxMarks: String(paper.maxMarks), passMarks: String(paper.passMarks) });
    }
  }
  const max = Number(values.maxMarks);
  const pass = Number(values.passMarks);
  const invalid = !(max >= 1) || !(pass >= 0) || pass > max;
  const mutation = useMutation({
    mutationFn: () =>
      updatePaper(paper!._id, { date: values.date || null, startTime: values.startTime || undefined, maxMarks: max, passMarks: pass }),
    onSuccess: async () => {
      await onSaved();
      toast.success('Paper updated');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't update the paper")),
  });
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));
  return (
    <Dialog open={Boolean(paper)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {paper?.subjectId?.name} — {paper?.classId?.name}
          </DialogTitle>
          <DialogDescription>Max marks can&apos;t go below a mark already entered.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date">{({ id }) => <Input id={id} type="date" min={examStart.slice(0, 10)} max={examEnd.slice(0, 10)} value={values.date} onChange={set('date')} />}</Field>
          <Field label="Starts at">{({ id }) => <Input id={id} type="time" value={values.startTime} onChange={set('startTime')} />}</Field>
          <Field label="Max marks">{({ id }) => <Input id={id} type="number" min={1} step="0.5" value={values.maxMarks} onChange={set('maxMarks')} />}</Field>
          <Field label="Pass marks" error={pass > max ? 'More than max marks' : undefined}>
            {({ id, describedBy }) => <Input id={id} type="number" min={0} step="0.5" aria-describedby={describedBy} value={values.passMarks} onChange={set('passMarks')} />}
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={invalid || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
