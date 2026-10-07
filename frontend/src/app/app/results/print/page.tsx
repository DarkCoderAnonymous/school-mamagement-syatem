'use client';

import { Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { ReportCard } from '@/components/exams/report-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { useAuthStore } from '@/lib/auth-store';
import { getExamSettings, listResults } from '@/lib/api/exams';

/**
 * Every report card of a class (or one section) on one page, one card per
 * printed sheet, in section then roll-number order — the stack a class
 * teacher hands out. Browser print stands in for PDF generation.
 */
function BulkReportCards() {
  const search = useSearchParams();
  const examId = search.get('examId') ?? undefined;
  const classId = search.get('classId') ?? undefined;
  const sectionId = search.get('sectionId') ?? undefined;
  const schoolName = useAuthStore((s) => s.user?.schoolName) ?? 'School';
  const settings = useQuery({ queryKey: ['exam-settings'], queryFn: getExamSettings, staleTime: 300_000 });
  const results = useQuery({
    queryKey: ['exam-results', 'bulk', examId, classId, sectionId],
    queryFn: () => listResults({ examId, classId, sectionId, limit: 100 }),
    enabled: Boolean(examId && classId),
  });
  const cards = useMemo(
    () =>
      [...(results.data?.items ?? [])].sort(
        (a, b) =>
          (a.sectionName ?? '').localeCompare(b.sectionName ?? '') ||
          (a.student.rollNumber ?? '').localeCompare(b.student.rollNumber ?? '', undefined, { numeric: true }) ||
          a.student.name.localeCompare(b.student.name),
      ),
    [results.data],
  );

  if (results.isLoading || settings.isLoading) return <Skeleton className="mx-auto h-[36rem] max-w-3xl rounded-xl" />;
  if (results.isError) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={results.error} onRetry={() => void results.refetch()} title="Couldn't load the report cards" />
      </div>
    );
  }
  const first = cards[0];
  const more = (results.data?.meta.total ?? 0) > cards.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Report cards"
          description={first ? `${first.examName} · ${first.className}${sectionId && first.sectionName ? ` · Section ${first.sectionName}` : ''} · ${cards.length} students` : undefined}
          breadcrumbs={[
            { label: 'Dashboard', href: '/app' },
            { label: 'Results', href: `/app/results?examId=${examId ?? ''}&classId=${classId ?? ''}` },
            { label: 'Report cards' },
          ]}
          action={
            <Button onClick={() => window.print()} disabled={cards.length === 0}>
              <Printer className="size-4" />
              Print {cards.length}
            </Button>
          }
        />
        {more && <p className="text-warning-ink text-sm">Only the first 100 are shown — print one section at a time.</p>}
      </div>
      {cards.length === 0 ? (
        <div className="bg-card rounded-xl border">
          <EmptyState title="No report cards" description="This class has no published results for the exam." />
        </div>
      ) : (
        cards.map((r, i) => (
          <div key={r._id} className={i < cards.length - 1 ? 'break-after-page' : undefined}>
            <ReportCard
              result={r}
              schoolName={schoolName}
              bands={r.gradingBands?.length ? r.gradingBands : (settings.data?.gradingBands ?? [])}
              showPositions={settings.data?.showPositions ?? true}
            />
          </div>
        ))
      )}
    </div>
  );
}

export default function BulkReportCardsPage() {
  return (
    <Suspense fallback={null}>
      <BulkReportCards />
    </Suspense>
  );
}
