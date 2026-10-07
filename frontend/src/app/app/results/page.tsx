'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Award, Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NativeSelect } from '@/components/form/native-select';
import { useUrlState } from '@/hooks/use-url-state';
import { marksLabel, ordinal, pctLabel } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { getAnalysis, getExamSettings, listExams, listResults } from '@/lib/api/exams';
import { listSections } from '@/lib/api/school';
import type { ExamResult } from '@/lib/api/types';
import { AnalysisPanel } from './analysis-panel';
import { StudentLink } from '@/components/students/student-quick-view';
import { resultsTabFor } from '@/components/students/student-records';

export default function ResultsPage() {
  const url = useUrlState();
  const router = useRouter();
  const tab = url.get('tab') ?? 'sheet';

  const exams = useQuery({ queryKey: ['exams', 'options'], queryFn: () => listExams({ limit: 100 }), staleTime: 60_000 });
  const published = useMemo(
    () => (exams.data?.items ?? []).filter((e) => e.status === 'PUBLISHED' || e.status === 'PARTLY_PUBLISHED'),
    [exams.data],
  );
  const examId = url.get('examId') ?? published[0]?._id;
  const exam = published.find((e) => e._id === examId) ?? (exams.data?.items ?? []).find((e) => e._id === examId);

  const overview = useQuery({ queryKey: ['exam-results', 'analysis', examId], queryFn: () => getAnalysis(examId!), enabled: Boolean(examId) });
  const classes = overview.data?.classes ?? [];
  const classId = url.get('classId') ?? classes[0]?.classId;
  const settings = useQuery({ queryKey: ['exam-settings'], queryFn: getExamSettings, staleTime: 300_000 });
  const sections = useQuery({
    queryKey: ['sections', 'options', classId],
    queryFn: () => listSections({ classId, limit: 100 }),
    enabled: Boolean(classId),
    staleTime: 60_000,
  });
  const classAnalysis = useQuery({
    queryKey: ['exam-results', 'analysis', examId, classId],
    queryFn: () => getAnalysis(examId!, classId),
    enabled: Boolean(examId && classId) && tab === 'analysis',
  });

  const params = {
    examId,
    classId,
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 50),
    sort: url.get('sort') ?? 'classRank',
    search: url.get('search'),
    sectionId: url.get('sectionId'),
    result: url.get('result'),
  };
  const results = useQuery({ queryKey: ['exam-results', 'list', params], queryFn: () => listResults(params), enabled: Boolean(examId && classId) });
  const showPositions = settings.data?.showPositions ?? true;
  const subjects = useMemo(() => results.data?.items[0]?.subjects.map((s) => s.name) ?? [], [results.data]);

  const columns = useMemo<DataTableColumn<ExamResult>[]>(() => {
    const position: DataTableColumn<ExamResult> = {
      id: 'classRank',
      header: 'Pos.',
      cell: ({ row }) => (
        <span
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
            row.original.classRank === 1 ? 'bg-warning-soft text-warning-ink' : 'bg-muted text-muted-foreground',
          )}
        >
          {row.original.classRank}
        </span>
      ),
    };
    return [
      ...(showPositions ? [position] : []),
      {
        id: 'student',
        header: 'Student',
        cell: ({ row }) => (
          <div className="min-w-0">
            <StudentLink studentId={row.original.studentId} tab={resultsTabFor(exam?.type)} className="block truncate font-medium">
              {row.original.student.name}
            </StudentLink>
            <p className="text-muted-foreground text-xs">
              <span className="font-mono">{row.original.student.admissionNumber}</span>
              {row.original.sectionName ? ` · Section ${row.original.sectionName}` : ''}
            </p>
          </div>
        ),
      },
      ...subjects.map(
        (name): DataTableColumn<ExamResult> => ({
          id: `subject-${name}`,
          header: name,
          cell: ({ row }) => {
            const s = row.original.subjects.find((x) => x.name === name);
            if (!s) return <span className="text-muted-foreground">—</span>;
            return (
              <span className={cn('tabular-nums', !s.passed && 'text-destructive font-medium')} title={`${s.grade} · ${pctLabel(s.percentage)}`}>
                {s.isAbsent ? 'AB' : marksLabel(s.marksObtained)}
                <span className="text-muted-foreground text-xs">/{marksLabel(s.maxMarks)}</span>
              </span>
            );
          },
        }),
      ),
      {
        id: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="font-medium tabular-nums">
            {marksLabel(row.original.totalObtained)}
            <span className="text-muted-foreground text-xs">/{marksLabel(row.original.totalMax)}</span>
          </span>
        ),
      },
      { id: 'percentage', header: '%', cell: ({ row }) => <span className="tabular-nums">{pctLabel(row.original.percentage)}</span> },
      { id: 'grade', header: 'Grade', cell: ({ row }) => <span className="font-semibold">{row.original.grade}</span> },
      {
        id: 'result',
        header: 'Result',
        cell: ({ row }) => <StatusBadge status={row.original.result} label={row.original.result === 'PASS' ? 'Pass' : 'Fail'} />,
      },
    ];
  }, [subjects, showPositions, exam?.type]);

  const pick = (patch: Record<string, string | undefined>) => url.set({ ...patch, page: undefined, sectionId: undefined, search: undefined, result: undefined });
  const className = classes.find((c) => c.classId === classId)?.className;

  if (exams.isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (exams.isError) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={exams.error} onRetry={() => void exams.refetch()} title="Couldn't load exams" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description="Published results by class — ranked sheet, subject analysis and report cards."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Results' }]}
        action={
          examId && classId ? (
            <Link
              href={`/app/results/print?examId=${examId}&classId=${classId}${params.sectionId ? `&sectionId=${params.sectionId}` : ''}`}
              className={buttonVariants()}
            >
              <Printer className="size-4" />
              Print report cards
            </Link>
          ) : undefined
        }
      />

      {published.length === 0 ? (
        <div className="bg-card rounded-xl border">
          <EmptyState
            icon={Award}
            title="No results published yet"
            description="Results appear here once every paper of a class is verified and published from its exam's date sheet."
            action={
              <Link href="/app/exams" className={buttonVariants({ variant: 'outline' })}>
                Go to exams
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="text-muted-foreground mb-1 block text-xs">Exam</span>
              <NativeSelect className="min-w-56" value={examId ?? ''} onChange={(e) => pick({ examId: e.target.value, classId: undefined })}>
                {published.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground mb-1 block text-xs">Class</span>
              <NativeSelect className="min-w-40" value={classId ?? ''} disabled={classes.length === 0} onChange={(e) => pick({ classId: e.target.value })}>
                {classes.map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.className}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {exam?.status === 'PARTLY_PUBLISHED' && (
              <p className="text-muted-foreground pb-2 text-xs">Some classes of this exam aren&apos;t published yet.</p>
            )}
          </div>

          <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'sheet' ? undefined : String(v) })}>
            <TabsList>
              <TabsTrigger value="sheet">Result sheet</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
            </TabsList>
            <TabsContent value="sheet" className="pt-4">
              <DataTable
                columns={columns}
                data={results.data?.items}
                meta={results.data?.meta}
                loading={results.isLoading || overview.isLoading}
                error={results.error}
                onRetry={() => void results.refetch()}
                sortableColumns={['classRank', 'percentage']}
                getRowId={(r) => r._id}
                onRowClick={(r) => router.push(`/app/results/${r._id}`)}
                exportFileName={`results-${exam?.name ?? 'exam'}-${className ?? 'class'}`.replace(/\s+/g, '-').toLowerCase()}
                emptyTitle="No results match"
                emptyDescription="Try a different search, section or result filter."
                toolbar={
                  <FilterBar
                    searchPlaceholder="Search student or admission no.…"
                    filters={[
                      { key: 'sectionId', label: 'Section', options: (sections.data?.items ?? []).map((s) => ({ value: s._id, label: `Section ${s.name}` })) },
                      { key: 'result', label: 'Result', options: [{ value: 'PASS', label: 'Passed' }, { value: 'FAIL', label: 'Failed' }] },
                    ]}
                  />
                }
              />
              {showPositions && results.data?.items[0] && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Positions are within {className}. {ordinal(1)} place is highlighted; ties share a position.
                </p>
              )}
            </TabsContent>
            <TabsContent value="analysis" className="pt-4">
              {classAnalysis.isLoading && <Skeleton className="h-80 w-full rounded-xl" />}
              {classAnalysis.isError && (
                <div className="rounded-xl border">
                  <ErrorState error={classAnalysis.error} onRetry={() => void classAnalysis.refetch()} title="Couldn't load the analysis" />
                </div>
              )}
              {classAnalysis.data && <AnalysisPanel data={classAnalysis.data} classComparison={overview.data?.classes} resultsTab={resultsTabFor(exam?.type)} />}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
