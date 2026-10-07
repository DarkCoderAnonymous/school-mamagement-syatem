'use client';

import { useMemo } from 'react';
import Link from 'next/link';
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
import { StatusBadge, humanizeStatus } from '@/components/ui/status-badge';
import { useUrlState } from '@/hooks/use-url-state';
import { useClassOptions } from '@/hooks/use-school-options';
import { avatarTint, fullName, initials } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { listStudents } from '@/lib/api/school';
import type { Student } from '@/lib/api/types';

const STATUS_TONE = { ACTIVE: 'ACTIVE', INACTIVE: 'DISABLED', GRADUATED: 'VERIFIED', TRANSFERRED: 'EXPIRED' } as const;

export default function StudentsPage() {
  const url = useUrlState();
  const router = useRouter();
  const classes = useClassOptions();

  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    sort: url.get('sort') ?? 'lastName',
    search: url.get('search'),
    classId: url.get('classId'),
    sectionId: url.get('sectionId'),
    status: url.get('status'),
    gender: url.get('gender'),
  };
  const query = useQuery({ queryKey: ['students', params], queryFn: () => listStudents(params) });
  const filtered = Boolean(params.search || params.classId || params.sectionId || params.status || params.gender);
  const sections = classes.data?.find((c) => c._id === params.classId)?.sections ?? [];

  const columns = useMemo<DataTableColumn<Student>[]>(
    () => [
      {
        id: 'lastName',
        header: 'Student',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className={cn('text-xs font-semibold', avatarTint(row.original._id))}>{initials(row.original)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{fullName(row.original)}</p>
              <p className="text-muted-foreground font-mono text-xs">{row.original.admissionNumber}</p>
            </div>
          </div>
        ),
      },
      {
        id: 'class',
        header: 'Class',
        cell: ({ row }) =>
          row.original.classId ? (
            <span>
              {row.original.classId.name}
              {row.original.sectionId && <span className="text-muted-foreground"> · {row.original.sectionId.name}</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'rollNumber',
        accessorKey: 'rollNumber',
        header: 'Roll no.',
        cell: ({ row }) => <span className="tabular-nums">{row.original.rollNumber ?? '—'}</span>,
      },
      {
        id: 'guardian',
        header: 'Primary contact',
        cell: ({ row }) => {
          const link = row.original.guardians.find((g) => g.isPrimary) ?? row.original.guardians[0];
          const g = link?.guardianId;
          return g ? (
            <div className="min-w-0">
              <p className="truncate text-sm">{fullName(g)}</p>
              <p className="text-muted-foreground text-xs tabular-nums">{g.phone}</p>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={STATUS_TONE[row.original.status]} label={humanizeStatus(row.original.status)} />,
      },
    ],
    [],
  );

  const admitButton = (
    <PermissionGate permission={Permission.STUDENT_CREATE}>
      <Link href={`/app/students/new${params.classId ? `?classId=${params.classId}${params.sectionId ? `&sectionId=${params.sectionId}` : ''}` : ''}`}>
        <Button>
          <Plus className="size-4" />
          Admit student
        </Button>
      </Link>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Students"
        description="Everyone enrolled at your school, with their class and family contacts."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Students' }]}
        action={admitButton}
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['lastName', 'rollNumber']}
        getRowId={(row) => row._id}
        onRowClick={(row) => router.push(`/app/students/${row._id}`)}
        exportFileName="students"
        emptyTitle={filtered ? 'No students match these filters' : 'No students yet'}
        emptyDescription={
          filtered
            ? 'Try a different search, or clear the filters.'
            : 'Admit your first student. Their admission number is issued automatically.'
        }
        emptyAction={filtered ? undefined : admitButton}
        toolbar={
          <FilterBar
            searchPlaceholder="Search name, admission or roll no…"
            filters={[
              {
                key: 'classId',
                label: 'Class',
                options: (classes.data ?? []).map((c) => ({ value: c._id, label: c.name })),
              },
              ...(params.classId && sections.length
                ? [{ key: 'sectionId', label: 'Section', options: sections.map((s) => ({ value: s._id, label: `Section ${s.name}` })) }]
                : []),
              {
                key: 'status',
                label: 'Status',
                options: [
                  { value: 'ACTIVE', label: 'Active' },
                  { value: 'INACTIVE', label: 'Inactive' },
                  { value: 'GRADUATED', label: 'Graduated' },
                  { value: 'TRANSFERRED', label: 'Transferred' },
                ],
              },
              {
                key: 'gender',
                label: 'Gender',
                options: [
                  { value: 'FEMALE', label: 'Female' },
                  { value: 'MALE', label: 'Male' },
                  { value: 'OTHER', label: 'Other' },
                ],
              },
            ]}
          />
        }
      />
    </div>
  );
}
