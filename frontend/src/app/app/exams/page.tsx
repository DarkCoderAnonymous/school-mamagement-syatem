'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { EXAM_STATUS_LABEL, EXAM_TYPE_LABEL } from '@/lib/labels';
import { listExams } from '@/lib/api/exams';
import type { Exam } from '@/lib/api/types';
import { ExamDialog } from './exam-dialog';
import { GradingTab } from './grading-tab';

export default function ExamsPage() {
  const url = useUrlState();
  const router = useRouter();
  const fmt = useSchoolFormat();
  const tab = url.get('tab') ?? 'exams';
  const [creating, setCreating] = useState(false);
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    search: url.get('search'),
    type: url.get('type'),
  };
  const query = useQuery({ queryKey: ['exams', params], queryFn: () => listExams(params), enabled: tab === 'exams' });

  const columns = useMemo<DataTableColumn<Exam>[]>(
    () => [
      {
        id: 'name',
        header: 'Exam',
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.name}</p>
            <p className="text-muted-foreground text-xs">{EXAM_TYPE_LABEL[row.original.type]}</p>
          </div>
        ),
      },
      {
        id: 'dates',
        header: 'Dates',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.date(row.original.startDate)} – {fmt.date(row.original.endDate)}
          </span>
        ),
      },
      {
        id: 'papers',
        header: 'Papers',
        cell: ({ row }) => {
          const c = row.original.paperCounts;
          const total = row.original.paperTotal ?? 0;
          const done = (c.VERIFIED ?? 0) + (c.PUBLISHED ?? 0);
          return total === 0 ? (
            <span className="text-muted-foreground">No papers yet</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="bg-muted h-1.5 w-20 overflow-hidden rounded-full" aria-hidden="true">
                <span className="bg-success block h-full origin-left" style={{ transform: `scaleX(${done / total})` }} />
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {done}/{total} verified
              </span>
            </div>
          );
        },
      },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} label={EXAM_STATUS_LABEL[row.original.status]} /> },
    ],
    [fmt],
  );

  const create = (
    <PermissionGate permission={Permission.EXAM_CREATE}>
      <Button onClick={() => setCreating(true)}>
        <Plus className="size-4" />
        New exam
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Exams"
        description="Set up each exam's date sheet, follow marks entry, and publish results class by class."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Exams' }]}
        action={tab === 'exams' ? create : undefined}
      />
      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'exams' ? undefined : String(v), page: undefined, search: undefined })}>
        <TabsList>
          <TabsTrigger value="exams">Exams</TabsTrigger>
          <TabsTrigger value="grading">Grading scale</TabsTrigger>
        </TabsList>
        <TabsContent value="exams" className="pt-4">
          <DataTable
            columns={columns}
            data={query.data?.items}
            meta={query.data?.meta}
            loading={query.isLoading}
            error={query.error}
            onRetry={() => void query.refetch()}
            getRowId={(r) => r._id}
            onRowClick={(r) => router.push(`/app/exams/${r._id}`)}
            emptyTitle={params.search || params.type ? 'No exams match' : 'No exams this session'}
            emptyDescription="Create an exam, then add its papers — one per class and subject — to build the date sheet."
            emptyAction={params.search || params.type ? undefined : create}
            toolbar={
              <FilterBar
                searchPlaceholder="Search exams…"
                filters={[{ key: 'type', label: 'Type', options: Object.entries(EXAM_TYPE_LABEL).map(([value, label]) => ({ value, label })) }]}
              />
            }
          />
        </TabsContent>
        <TabsContent value="grading" className="pt-4">
          <GradingTab />
        </TabsContent>
      </Tabs>
      <ExamDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
