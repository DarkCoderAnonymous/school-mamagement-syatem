'use client';

import { Suspense, use, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Printer, Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NativeSelect } from '@/components/form/native-select';
import { useClassOptions } from '@/hooks/use-school-options';
import { useUrlState } from '@/hooks/use-url-state';
import { fullName, marksLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getClassSheet, listExams } from '@/lib/api/exams';
import type { ClassSheetPaper, ClassSheetRow } from '@/lib/api/types';
import { StudentMarksDialog } from './student-marks-dialog';
import { StudentLink } from '@/components/students/student-quick-view';
import { resultsTabFor } from '@/components/students/student-records';

function cellFor(row: ClassSheetRow, paper: ClassSheetPaper) {
  const m = row.marks[paper._id];
  if (m?.isAbsent) return <span className="text-warning-ink text-xs font-medium">Abs</span>;
  if (m?.marksObtained === null || m?.marksObtained === undefined) return <span className="text-muted-foreground">—</span>;
  return <span className={cn(m.marksObtained < paper.passMarks && 'text-destructive font-medium')}>{marksLabel(m.marksObtained)}</span>;
}

/**
 * One class's students for an exam — pick a section, then a student to enter
 * all of their subjects. Each row shows the marks so far, what they've
 * obtained out of the class's total marks, and their percentage.
 */
function ClassMarks({ examId, classId }: { examId: string; classId: string }) {
  const url = useUrlState();
  const router = useRouter();
  const sectionId = url.get('section');
  const query = useQuery({
    queryKey: ['class-sheet', examId, classId, sectionId ?? 'all'],
    queryFn: () => getClassSheet(examId, classId, sectionId),
    // A background refetch mid-entry would be harmless (the modal keeps its drafts), but noisy.
    refetchOnWindowFocus: false,
  });
  const exams = useQuery({ queryKey: ['exams', 'options'], queryFn: () => listExams({ limit: 100 }), staleTime: 60_000 });
  const classes = useClassOptions();
  /** Switch test/exam or grade; the section is kept when staying in the same grade. */
  const switchTo = (nextExam: string, nextClass: string) =>
    router.push(`/app/marks/board/${nextExam}/${nextClass}${nextClass === classId && sectionId ? `?section=${sectionId}` : ''}`);
  const pickers = (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
      <label className="space-y-1">
        <span className="text-[0.8125rem] font-medium">Test / exam</span>
        <NativeSelect value={examId} onChange={(e) => switchTo(e.target.value, classId)}>
          {!exams.data?.items.some((e) => e._id === examId) && <option value={examId}>{query.data?.exam.name ?? 'Loading…'}</option>}
          {exams.data?.items.map((e) => (
            <option key={e._id} value={e._id}>
              {e.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="space-y-1">
        <span className="text-[0.8125rem] font-medium">Grade</span>
        <NativeSelect value={classId} onChange={(e) => switchTo(examId, e.target.value)}>
          {!classes.data?.some((c) => c._id === classId) && <option value={classId}>{query.data?.class.name ?? 'Loading…'}</option>}
          {classes.data?.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </NativeSelect>
      </label>
    </div>
  );
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const data = query.data;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !data) return data?.rows ?? [];
    return data.rows.filter(
      (r) => fullName(r.student).toLowerCase().includes(q) || (r.student.rollNumber ?? '').toLowerCase() === q || r.student.admissionNumber.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (query.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (query.isError || !data) {
    return (
      <div className="space-y-4">
        {pickers}
        <div className="rounded-xl border">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this grade for that test" />
        </div>
      </div>
    );
  }
  const sectionName = new Map(data.sections.map((s) => [s._id, s.name]));
  const complete = data.rows.filter((r) => data.papers.length > 0 && r.entered === data.papers.length).length;
  // The panel walks the rows as filtered, so "next" follows what's on screen.
  const panelSheet = { ...data, rows };
  const panelIndex = open === null ? null : rows.findIndex((r) => r.student._id === open);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${data.class.name} — ${data.exam.name}`}
        description={`${data.rows.length} students · ${data.papers.length} subjects · ${data.totalMax} total marks · ${complete} complete`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Marks entry', href: `/app/marks?examId=${examId}` },
          { label: data.class.name },
        ]}
        action={
          <Link href={`/app/exams/${examId}/date-sheet?classId=${classId}`} className={buttonVariants({ variant: 'outline' })}>
            <Printer className="size-4" />
            Date sheet
          </Link>
        }
      />

      {pickers}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {data.sections.length > 0 ? (
          <Tabs
            value={sectionId ?? 'all'}
            onValueChange={(v) => {
              setOpen(null);
              url.set({ section: v === 'all' ? undefined : String(v) });
            }}
          >
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
        <div className="relative sm:w-64">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" aria-hidden="true" />
          <Input aria-label="Find a student" placeholder="Name, roll or admission no." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {data.papers.length === 0 && (
        <p className="bg-warning-soft text-warning-ink flex items-center gap-2 rounded-lg px-3 py-2 text-sm">
          <ClipboardList className="size-4 shrink-0" aria-hidden="true" />
          {data.class.name} has no subjects on this exam&apos;s date sheet yet — open a student to add one, or make the date sheet on the Exams page.
        </p>
      )}

      {data.rows.length === 0 ? (
        <div className="bg-card rounded-xl border">
          <EmptyState icon={Users} title="No students" description={sectionId ? 'No active students in this section.' : 'No active students in this class.'} />
        </div>
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="px-4 py-2.5 font-medium">Roll</th>
                <th className="px-3 py-2.5 font-medium">Student</th>
                {data.papers.map((p) => (
                  <th key={p._id} className="px-2 py-2.5 text-right font-medium whitespace-nowrap" title={`${p.subject.name} — out of ${p.maxMarks}`}>
                    {p.subject.code || p.subject.name}
                    <span className="block font-normal">/{p.maxMarks}</span>
                  </th>
                ))}
                <th className="px-3 py-2.5 text-right font-medium">Obtained</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-4 py-2.5 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody className="rows-stagger">
              {rows.map((r) => {
                const done = data.papers.length > 0 && r.entered === data.papers.length;
                return (
                  <tr
                    key={r.student._id}
                    tabIndex={0}
                    className="hover:bg-muted/40 focus-visible:bg-muted/60 cursor-pointer border-b transition-colors outline-none last:border-0"
                    onClick={() => setOpen(r.student._id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen(r.student._id))}
                  >
                    <td className="text-muted-foreground px-4 py-2.5 tabular-nums">{r.student.rollNumber ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <StudentLink studentId={r.student._id} tab={resultsTabFor(data.exam.type)} className="block font-medium">
                        {fullName(r.student)}
                      </StudentLink>
                      <p className="text-muted-foreground text-xs">
                        {r.student.admissionNumber}
                        {!sectionId && sectionName.get(r.student.sectionId) ? ` · ${sectionName.get(r.student.sectionId)}` : ''}
                        {!done && data.papers.length > 0 && ` · ${r.entered}/${data.papers.length} entered`}
                      </p>
                    </td>
                    {data.papers.map((p) => (
                      <td key={p._id} className="px-2 py-2.5 text-right tabular-nums">
                        {cellFor(r, p)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{r.entered ? marksLabel(r.totalObtained) : '—'}</td>
                    <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">{r.totalMax}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.entered ? `${r.percentage.toFixed(1)}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length === 0 && <p className="text-muted-foreground px-4 py-6 text-center text-sm">No student matches “{search}”.</p>}
        </div>
      )}

      <StudentMarksDialog
        sheet={panelSheet}
        index={panelIndex === -1 ? null : panelIndex}
        onIndexChange={(i) => setOpen(i === null ? null : (rows[i]?.student._id ?? null))}
      />
    </div>
  );
}

export default function ClassMarksPage({ params }: { params: Promise<{ examId: string; classId: string }> }) {
  const { examId, classId } = use(params);
  return (
    <Suspense fallback={null}>
      <ClassMarks examId={examId} classId={classId} />
    </Suspense>
  );
}
