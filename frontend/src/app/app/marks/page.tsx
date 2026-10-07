'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { PAPER_STATUS_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { listExams, listPapers } from '@/lib/api/exams';
import type { ExamPaper } from '@/lib/api/types';
import { ClassBoard } from './class-board';

/**
 * Marks entry. Everyone lands on the class board — grade cards, then a
 * class's students, then one student's subjects. The paper queues remain:
 * teachers' papers for the subjects they teach, and for the exam office
 * every paper and the verification queue.
 */
export default function MarksQueuePage() {
  const url = useUrlState();
  const router = useRouter();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const office = can(Permission.EXAM_MARKS_PUBLISH);
  const tab = url.get('tab') ?? 'classes';
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    examId: url.get('examId'),
    status: tab === 'verify' ? 'SUBMITTED' : url.get('status'),
    mine: tab === 'mine' ? 'true' : undefined,
  };
  const query = useQuery({ queryKey: ['exam-papers', params], queryFn: () => listPapers(params), enabled: tab !== 'classes' });
  const exams = useQuery({ queryKey: ['exams', 'options'], queryFn: () => listExams({ limit: 100 }), staleTime: 60_000 });

  const columns = useMemo<DataTableColumn<ExamPaper>[]>(
    () => [
      {
        id: 'paper',
        header: 'Paper',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">
              {row.original.subjectId?.name} <span className="text-muted-foreground font-normal">· {row.original.classId?.name}</span>
            </p>
            <p className="text-muted-foreground text-xs">{row.original.examId?.name}</p>
          </div>
        ),
      },
      { id: 'date', header: 'Date', cell: ({ row }) => <span className="tabular-nums">{row.original.date ? fmt.date(row.original.date) : '—'}</span> },
      {
        id: 'progress',
        header: 'Marks entered',
        cell: ({ row }) => {
          const entered = row.original.marksEntered ?? 0;
          const total = row.original.classStrength ?? 0;
          return (
            <div className="flex items-center gap-2">
              <span className="bg-muted h-1.5 w-20 overflow-hidden rounded-full" aria-hidden="true">
                <span
                  className={cn('block h-full origin-left', entered >= total && total > 0 ? 'bg-success' : 'bg-primary')}
                  style={{ transform: `scaleX(${total ? entered / total : 0})` }}
                />
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {entered}/{total}
              </span>
            </div>
          );
        },
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} label={PAPER_STATUS_LABEL[row.original.status]} /> },
    ],
    [fmt],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marks entry"
        description={
          tab === 'classes'
            ? 'Pick a class, then a student, to enter every subject’s marks at once.'
            : office
              ? 'Every paper, and the ones waiting for you to verify.'
              : 'Papers for the classes and subjects assigned to you. Open one to enter marks.'
        }
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Marks entry' }]}
      />
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'classes' ? undefined : String(v), page: undefined, status: undefined })}>
        <TabsList>
          <TabsTrigger value="classes">By class</TabsTrigger>
          <TabsTrigger value="mine">My papers</TabsTrigger>
          {office && <TabsTrigger value="all">All papers</TabsTrigger>}
          {office && <TabsTrigger value="verify">Awaiting verification</TabsTrigger>}
        </TabsList>
      </Tabs>
      {tab === 'classes' ? (
        <ClassBoard />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.items}
          meta={query.data?.meta}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          getRowId={(r) => r._id}
          onRowClick={(r) => router.push(`/app/marks/${r._id}`)}
          emptyTitle={tab === 'verify' ? 'Nothing waiting for verification' : tab === 'mine' ? 'No papers for your classes' : 'No papers yet'}
          emptyDescription={
            tab === 'verify'
              ? 'Papers appear here when a teacher submits them.'
              : tab === 'mine'
                ? 'Papers show up here once an exam includes a class and subject you’re assigned to teach.'
                : 'Create an exam and add its papers first.'
          }
          toolbar={
            <FilterBar
              searchable={false}
              filters={[
                { key: 'examId', label: 'Exam', options: (exams.data?.items ?? []).map((e) => ({ value: e._id, label: e.name })) },
                ...(tab === 'verify' ? [] : [{ key: 'status', label: 'Status', options: Object.entries(PAPER_STATUS_LABEL).map(([value, label]) => ({ value, label })) }]),
              ]}
            />
          }
        />
      )}
    </div>
  );
}
