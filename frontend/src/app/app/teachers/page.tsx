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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { StatusBadge } from '@/components/ui/status-badge';
import { useUrlState } from '@/hooks/use-url-state';
import { useSubjectOptions } from '@/hooks/use-school-options';
import { useSchoolFormat } from '@/lib/format';
import { avatarTint, fullName, initials } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { listTeachers } from '@/lib/api/school';
import type { Teacher } from '@/lib/api/types';
import { TeacherFormDialog } from './teacher-form-dialog';

const STATUS_LABEL = { ACTIVE: 'Active', ON_LEAVE: 'On leave', TERMINATED: 'Terminated' } as const;
const STATUS_TONE = { ACTIVE: 'ACTIVE', ON_LEAVE: 'PENDING', TERMINATED: 'DISABLED' } as const;

export default function TeachersPage() {
  const url = useUrlState();
  const router = useRouter();
  const fmt = useSchoolFormat();
  const subjects = useSubjectOptions();
  const [creating, setCreating] = useState(false);

  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    sort: url.get('sort') ?? 'lastName',
    search: url.get('search'),
    status: url.get('status'),
    subjectId: url.get('subjectId'),
  };
  const query = useQuery({ queryKey: ['teachers', params], queryFn: () => listTeachers(params) });
  const filtered = Boolean(params.search || params.status || params.subjectId);

  const columns = useMemo<DataTableColumn<Teacher>[]>(
    () => [
      {
        id: 'lastName',
        header: 'Teacher',
        cell: ({ row }) => {
          const e = row.original.employee;
          return (
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback className={cn('text-xs font-semibold', avatarTint(row.original._id))}>{initials(e)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate font-medium">{fullName(e)}</p>
                <p className="text-muted-foreground truncate text-xs">{e.email ?? e.designation}</p>
              </div>
            </div>
          );
        },
      },
      {
        id: 'employeeNumber',
        header: 'Employee no.',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.employee.employeeNumber}</span>,
      },
      {
        id: 'subjects',
        header: 'Subjects',
        cell: ({ row }) =>
          row.original.subjects.length ? (
            <div className="flex max-w-xs flex-wrap gap-1">
              {row.original.subjects.slice(0, 3).map((s) => (
                <span key={s._id} className="bg-muted rounded px-1.5 py-0.5 text-xs">
                  {s.name}
                </span>
              ))}
              {row.original.subjects.length > 3 && (
                <span className="text-muted-foreground text-xs">+{row.original.subjects.length - 3}</span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">None assigned</span>
          ),
      },
      {
        id: 'joiningDate',
        header: 'Joined',
        cell: ({ row }) => <span className="tabular-nums">{fmt.date(row.original.employee.joiningDate)}</span>,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.original.employee.status;
          return <StatusBadge status={STATUS_TONE[s]} label={STATUS_LABEL[s]} />;
        },
      },
    ],
    [fmt],
  );

  const createButton = (
    <PermissionGate permission={Permission.TEACHER_CREATE}>
      <Button onClick={() => setCreating(true)}>
        <Plus className="size-4" />
        Add teacher
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teachers"
        description="Teaching staff, the subjects they cover, and their access to the school."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Teachers' }]}
        action={createButton}
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['lastName', 'employeeNumber', 'joiningDate']}
        getRowId={(row) => row._id}
        onRowClick={(row) => router.push(`/app/teachers/${row._id}`)}
        exportFileName="teachers"
        emptyTitle={filtered ? 'No teachers match these filters' : 'No teachers yet'}
        emptyDescription={
          filtered ? 'Try a different search or clear the filters.' : 'Add your teaching staff. Each one gets their own sign-in.'
        }
        emptyAction={filtered ? undefined : createButton}
        toolbar={
          <FilterBar
            searchPlaceholder="Search name, email or employee no…"
            filters={[
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'ON_LEAVE', label: 'On leave' },
                  { value: 'TERMINATED', label: 'Terminated' },
                ],
              },
              {
                key: 'subjectId',
                label: 'Subject',
                options: (subjects.data ?? []).map((s) => ({ value: s._id, label: s.name })),
              },
            ]}
          />
        }
      />
      <TeacherFormDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
