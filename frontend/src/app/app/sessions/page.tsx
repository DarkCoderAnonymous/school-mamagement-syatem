'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PermissionGate } from '@/components/auth/permission-gate';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { ApiRequestError } from '@/lib/api/http';
import {
  archiveAcademicSession,
  listAcademicSessions,
  updateAcademicSession,
} from '@/lib/api/academic-sessions';
import type { AcademicSession } from '@/lib/api/types';
import { SessionFormDialog } from './session-form-dialog';

export default function AcademicSessionsPage() {
  const url = useUrlState();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicSession | undefined>();
  const [archiving, setArchiving] = useState<AcademicSession | undefined>();

  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    sort: url.get('sort') ?? '-startDate',
    search: url.get('search'),
    isCurrent: url.get('isCurrent'),
  };

  const query = useQuery({
    // The key includes every server-side param, so the URL is the single
    // source of truth for what's on screen and the cache can't go stale.
    queryKey: ['academic-sessions', params],
    queryFn: () => listAcademicSessions(params),
  });

  const setCurrent = useMutation({
    mutationFn: (session: AcademicSession) =>
      updateAcademicSession(session._id, { isCurrent: true }),
    onSuccess: async (_data, session) => {
      await queryClient.invalidateQueries({ queryKey: ['academic-sessions'] });
      toast.success(`${session.name} is now the current session`);
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiRequestError ? error.message : "Couldn't update the session"),
  });

  const archive = useMutation({
    mutationFn: (session: AcademicSession) => archiveAcademicSession(session._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['academic-sessions'] });
      toast.success('Session archived');
      setArchiving(undefined);
    },
    onError: (error: unknown) =>
      toast.error(
        error instanceof ApiRequestError ? error.message : "Couldn't archive the session",
      ),
  });

  const columns = useMemo<DataTableColumn<AcademicSession>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Session',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.original.name}</span>
            {row.original.isCurrent && <StatusBadge status="ACTIVE" label="Current" />}
          </div>
        ),
      },
      {
        id: 'startDate',
        accessorKey: 'startDate',
        header: 'Starts',
        cell: ({ row }) => <span className="tabular-nums">{fmt.date(row.original.startDate)}</span>,
      },
      {
        id: 'endDate',
        accessorKey: 'endDate',
        header: 'Ends',
        cell: ({ row }) => <span className="tabular-nums">{fmt.date(row.original.endDate)}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          const session = row.original;
          const canEdit = can(Permission.SESSION_UPDATE);
          const canDelete = can(Permission.SESSION_DELETE);
          if (!canEdit && !canDelete) return null;

          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                  aria-label={`Actions for ${session.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem
                      onClick={() => {
                        setEditing(session);
                        setFormOpen(true);
                      }}
                    >
                      Edit
                    </DropdownMenuItem>
                  )}
                  {canEdit && !session.isCurrent && (
                    <DropdownMenuItem onClick={() => setCurrent.mutate(session)}>
                      Set as current
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <DropdownMenuItem
                      // The server refuses to archive the current session;
                      // disabling here explains why before the round trip.
                      disabled={session.isCurrent}
                      onClick={() => setArchiving(session)}
                    >
                      {session.isCurrent ? 'Archive (set another as current first)' : 'Archive'}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [can, fmt, setCurrent],
  );

  const createButton = (
    <PermissionGate permission={Permission.SESSION_CREATE}>
      <Button
        onClick={() => {
          setEditing(undefined);
          setFormOpen(true);
        }}
      >
        <Plus className="size-4" />
        New session
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic sessions"
        description="School years. Everything else — classes, attendance, exams, fees — is recorded against one."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Academic sessions' }]}
        action={createButton}
      />

      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['name', 'startDate', 'endDate']}
        getRowId={(row) => row._id}
        exportFileName="academic-sessions"
        emptyTitle={
          url.get('search') ? 'No sessions match your search' : 'No academic sessions yet'
        }
        emptyDescription={
          url.get('search')
            ? 'Try a different name, or clear the search.'
            : 'Create your first school year to start adding classes, students and fees.'
        }
        emptyAction={url.get('search') ? undefined : createButton}
        toolbar={
          <FilterBar
            searchPlaceholder="Search sessions…"
            filters={[
              {
                key: 'isCurrent',
                label: 'Status',
                options: [
                  { value: 'true', label: 'Current' },
                  { value: 'false', label: 'Past / upcoming' },
                ],
              },
            ]}
          />
        }
      />

      <SessionFormDialog open={formOpen} onOpenChange={setFormOpen} session={editing} />

      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(next) => !next && setArchiving(undefined)}
        title="Archive this session?"
        description={
          archiving
            ? `"${archiving.name}" will be hidden from lists. Its records are kept and it can be restored by an administrator.`
            : undefined
        }
        confirmLabel="Archive session"
        destructive
        pending={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
      />
    </div>
  );
}
