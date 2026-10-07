'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, School, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { NativeSelect } from '@/components/form/native-select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/lib/permissions';
import { errorMessage } from '@/lib/form-errors';
import { fullName } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { listAcademicSessions } from '@/lib/api/academic-sessions';
import { archiveClass, archiveSection, listClasses } from '@/lib/api/school';
import type { SchoolClass, Section } from '@/lib/api/types';
import { ClassDialog, SectionDialog } from './class-dialogs';

const MENU_TRIGGER =
  'hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2';

export default function ClassesPage() {
  const can = usePermission();
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string>('');
  const [classDialog, setClassDialog] = useState<{ open: boolean; cls?: SchoolClass }>({ open: false });
  const [sectionDialog, setSectionDialog] = useState<{ open: boolean; cls?: SchoolClass; section?: Section }>({
    open: false,
  });
  const [archiving, setArchiving] = useState<{ kind: 'class'; item: SchoolClass } | { kind: 'section'; item: Section } | null>(
    null,
  );

  const sessions = useQuery({
    queryKey: ['academic-sessions', { limit: 50, sort: '-startDate' }],
    queryFn: () => listAcademicSessions({ limit: 50, sort: '-startDate' }),
    enabled: can(Permission.SESSION_READ),
  });

  const params = { limit: 100, ...(sessionId ? { academicSessionId: sessionId } : {}) };
  const query = useQuery({ queryKey: ['classes', params], queryFn: () => listClasses(params) });
  const classes = useMemo(() => query.data?.items ?? [], [query.data]);
  const activeSessionId =
    sessionId || (typeof classes[0]?.academicSessionId === 'string' ? classes[0].academicSessionId : '') ||
    sessions.data?.items.find((s) => s.isCurrent)?._id || '';
  const noCurrentSession = sessions.isSuccess && !sessions.data.items.some((s) => s.isCurrent) && !sessionId;

  const totals = useMemo(
    () => ({
      sections: classes.reduce((n, c) => n + c.sections.length, 0),
      students: classes.reduce((n, c) => n + c.studentCount, 0),
    }),
    [classes],
  );

  const archive = useMutation({
    mutationFn: async () => {
      if (!archiving) return;
      if (archiving.kind === 'class') await archiveClass(archiving.item._id);
      else await archiveSection(archiving.item._id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success(archiving?.kind === 'class' ? 'Class archived' : 'Section archived');
      setArchiving(null);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't archive it")),
  });

  const newClassButton = (
    <PermissionGate permission={Permission.CLASS_CREATE}>
      <Button onClick={() => setClassDialog({ open: true })} disabled={noCurrentSession}>
        <Plus className="size-4" />
        New class
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classes & sections"
        description="Grades for the school year, the sections inside them, and who leads each one."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Classes & sections' }]}
        action={newClassButton}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {sessions.data && sessions.data.items.length > 0 ? (
          <div className="flex items-center gap-2">
            <label htmlFor="session" className="text-muted-foreground text-sm whitespace-nowrap">
              Session
            </label>
            <NativeSelect
              id="session"
              className="w-48"
              value={activeSessionId}
              onChange={(e) => setSessionId(e.target.value)}
            >
              {sessions.data.items.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                  {s.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : (
          <span />
        )}
        {query.isSuccess && classes.length > 0 && (
          <p className="text-muted-foreground text-sm tabular-nums">
            {classes.length} classes · {totals.sections} sections · {totals.students} students
          </p>
        )}
      </div>

      {query.isLoading && (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      )}

      {query.isError && (
        <div className="rounded-xl border">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load classes" />
        </div>
      )}

      {query.isSuccess && classes.length === 0 && (
        <div className="bg-card rounded-xl border">
          {noCurrentSession ? (
            <EmptyState
              icon={School}
              title="Set up your school year first"
              description="Classes belong to an academic session. Create one and mark it current, then come back to add classes."
              action={
                <Link href="/app/sessions">
                  <Button>Go to academic sessions</Button>
                </Link>
              }
            />
          ) : (
            <EmptyState
              icon={School}
              title="No classes yet"
              description="Add your grades — for example Grade 1 to Grade 10 — then split each into sections."
              action={newClassButton}
            />
          )}
        </div>
      )}

      <div className="space-y-4">
        {classes.map((cls) => (
          <ClassPanel
            key={cls._id}
            cls={cls}
            onEditClass={() => setClassDialog({ open: true, cls })}
            onArchiveClass={() => setArchiving({ kind: 'class', item: cls })}
            onAddSection={() => setSectionDialog({ open: true, cls })}
            onEditSection={(section) => setSectionDialog({ open: true, cls, section })}
            onArchiveSection={(section) => setArchiving({ kind: 'section', item: section })}
          />
        ))}
      </div>

      <ClassDialog
        open={classDialog.open}
        onOpenChange={(open) => setClassDialog((d) => ({ ...d, open }))}
        cls={classDialog.cls}
        academicSessionId={sessionId || undefined}
        nextOrder={Math.max(0, ...classes.map((c) => c.order)) + 1}
      />
      <SectionDialog
        open={sectionDialog.open}
        onOpenChange={(open) => setSectionDialog((d) => ({ ...d, open }))}
        cls={sectionDialog.cls}
        section={sectionDialog.section}
      />
      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => !open && setArchiving(null)}
        title={archiving?.kind === 'class' ? `Archive ${archiving.item.name}?` : `Archive section ${archiving?.item.name}?`}
        description={
          archiving?.kind === 'class'
            ? 'The class and all its sections are hidden. This is refused while any active student is still enrolled.'
            : 'The section is hidden. This is refused while any active student is still in it.'
        }
        confirmLabel="Archive"
        destructive
        pending={archive.isPending}
        onConfirm={() => archive.mutate()}
      />
    </div>
  );
}

function ClassPanel({
  cls,
  onEditClass,
  onArchiveClass,
  onAddSection,
  onEditSection,
  onArchiveSection,
}: {
  cls: SchoolClass;
  onEditClass: () => void;
  onArchiveClass: () => void;
  onAddSection: () => void;
  onEditSection: (section: Section) => void;
  onArchiveSection: (section: Section) => void;
}) {
  const can = usePermission();
  const canUpdate = can(Permission.CLASS_UPDATE);
  const canDelete = can(Permission.CLASS_DELETE);

  return (
    <section className="bg-card rounded-xl border" aria-labelledby={`class-${cls._id}`}>
      <header className="flex items-center gap-3 border-b px-5 py-3.5">
        <div className="min-w-0 flex-1">
          <h2 id={`class-${cls._id}`} className="truncate font-semibold">
            {cls.name}
          </h2>
          <p className="text-muted-foreground text-xs tabular-nums">
            {cls.sections.length} section{cls.sections.length === 1 ? '' : 's'} · {cls.studentCount} of {cls.capacity}{' '}
            seats filled
          </p>
        </div>
        <PermissionGate permission={Permission.CLASS_CREATE}>
          <Button variant="outline" size="sm" onClick={onAddSection}>
            <Plus className="size-3.5" />
            Section
          </Button>
        </PermissionGate>
        {(canUpdate || canDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger className={MENU_TRIGGER} aria-label={`Actions for ${cls.name}`}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canUpdate && <DropdownMenuItem onClick={onEditClass}>Edit class</DropdownMenuItem>}
              {canDelete && <DropdownMenuItem onClick={onArchiveClass}>Archive class</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {cls.sections.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          No sections yet. Every class needs at least one before students can be admitted into it.
        </p>
      ) : (
        <ul className="divide-y">
          {cls.sections.map((section) => {
            const teacher = section.classTeacherId?.employeeId;
            const fill = section.capacity ? Math.min(100, Math.round((section.studentCount / section.capacity) * 100)) : 0;
            return (
              <li key={section._id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 sm:grid-cols-[8rem_1fr_12rem_auto]">
                <div className="col-start-1 row-start-1 flex items-center gap-2 sm:col-auto sm:row-auto">
                  <span className="font-medium">Section {section.name}</span>
                  {fill >= 100 && <StatusBadge status="OVERDUE" label="Full" />}
                </div>
                <div className="text-muted-foreground col-span-2 flex min-w-0 items-center gap-1.5 text-sm sm:col-span-1">
                  <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className={cn('truncate', teacher && 'text-foreground')}>
                    {teacher ? fullName(teacher) : 'No class teacher'}
                  </span>
                  {section.room && <span className="truncate">· {section.room}</span>}
                </div>
                <div className="col-span-2 flex items-center gap-2 sm:col-span-1">
                  <div
                    className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={section.capacity}
                    aria-valuenow={section.studentCount}
                    aria-label={`Section ${section.name} occupancy`}
                  >
                    <div
                      className={cn('h-full rounded-full', fill >= 100 ? 'bg-destructive' : fill >= 90 ? 'bg-warning' : 'bg-primary')}
                      style={{ width: `${fill}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground w-14 text-right text-xs tabular-nums">
                    {section.studentCount}/{section.capacity}
                  </span>
                </div>
                <div className="col-start-2 row-start-1 flex justify-end sm:col-auto sm:row-auto">
                  {(canUpdate || canDelete) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger className={MENU_TRIGGER} aria-label={`Actions for section ${section.name}`}>
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem render={<Link href={`/app/students?classId=${cls._id}&sectionId=${section._id}`} />}>
                          View students
                        </DropdownMenuItem>
                        {canUpdate && <DropdownMenuItem onClick={() => onEditSection(section)}>Edit section</DropdownMenuItem>}
                        {canDelete && (
                          <DropdownMenuItem onClick={() => onArchiveSection(section)}>Archive section</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
