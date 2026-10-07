'use client';

import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { ReportCard } from '@/components/exams/report-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { getReportCard } from '@/lib/api/exams';

export default function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useQuery({ queryKey: ['exam-results', 'card', id], queryFn: () => getReportCard(id) });
  if (query.isLoading) return <Skeleton className="mx-auto h-[36rem] max-w-3xl rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load this report card" />
      </div>
    );
  }
  const r = query.data;
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="print:hidden">
        <PageHeader
          title={r.student.name}
          description={`${r.examName} · ${r.className}${r.sectionName ? ` · Section ${r.sectionName}` : ''}`}
          breadcrumbs={[
            { label: 'Dashboard', href: '/app' },
            { label: 'Results', href: `/app/results?examId=${r.examId}&classId=${r.classId}` },
            { label: r.student.name },
          ]}
          action={
            <Button onClick={() => window.print()}>
              <Printer className="size-4" />
              Print
            </Button>
          }
        />
      </div>
      <ReportCard
        result={r}
        schoolName={r.school.name}
        schoolAddress={r.school.address}
        logoUrl={r.school.logoUrl}
        bands={r.gradingBands}
        showPositions={r.showPositions}
        sessionName={r.exam?.academicSessionId?.name}
        guardian={r.guardian}
        dateOfBirth={r.dateOfBirth}
      />
    </div>
  );
}
