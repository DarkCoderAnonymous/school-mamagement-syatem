'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field } from '@/components/form/field';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { applyServerError, errorMessage } from '@/lib/form-errors';
import { archiveSubject, createSubject, listSubjects, updateSubject } from '@/lib/api/school';
import type { Subject } from '@/lib/api/types';

export default function SubjectsPage() {
  const url = useUrlState();
  const can = usePermission();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; subject?: Subject }>({ open: false });
  const [archiving, setArchiving] = useState<Subject>();

  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    sort: url.get('sort') ?? 'name',
    search: url.get('search'),
    isElective: url.get('isElective'),
  };
  const query = useQuery({ queryKey: ['subjects', params], queryFn: () => listSubjects(params) });

  const archive = useMutation({
    mutationFn: (subject: Subject) => archiveSubject(subject._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success('Subject archived');
      setArchiving(undefined);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't archive the subject")),
  });

  const columns = useMemo<DataTableColumn<Subject>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Subject',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            {row.original.description && (
              <p className="text-muted-foreground max-w-md truncate text-xs">{row.original.description}</p>
            )}
          </div>
        ),
      },
      {
        id: 'code',
        accessorKey: 'code',
        header: 'Code',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) =>
          row.original.isElective ? <StatusBadge status="SCHEDULED" label="Elective" /> : <StatusBadge status="ACTIVE" label="Core" />,
      },
      {
        id: 'teacherCount',
        header: 'Teachers',
        cell: ({ row }) => <span className="tabular-nums">{row.original.teacherCount}</span>,
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          const canEdit = can(Permission.CLASS_UPDATE);
          const canDelete = can(Permission.CLASS_DELETE);
          if (!canEdit && !canDelete) return null;
          return (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                  aria-label={`Actions for ${row.original.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit && (
                    <DropdownMenuItem onClick={() => setDialog({ open: true, subject: row.original })}>Edit</DropdownMenuItem>
                  )}
                  {canDelete && <DropdownMenuItem onClick={() => setArchiving(row.original)}>Archive</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [can],
  );

  const createButton = (
    <PermissionGate permission={Permission.CLASS_CREATE}>
      <Button onClick={() => setDialog({ open: true })}>
        <Plus className="size-4" />
        New subject
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subjects"
        description="What's taught at your school. Teachers are matched to subjects, and exams are set per subject."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Subjects' }]}
        action={createButton}
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['name', 'code']}
        getRowId={(row) => row._id}
        exportFileName="subjects"
        emptyTitle={url.get('search') ? 'No subjects match your search' : 'No subjects yet'}
        emptyDescription={
          url.get('search') ? 'Try a different name or code.' : 'Add the subjects you teach — Mathematics, English, Science…'
        }
        emptyAction={url.get('search') ? undefined : createButton}
        toolbar={
          <FilterBar
            searchPlaceholder="Search name or code…"
            filters={[
              {
                key: 'isElective',
                label: 'Type',
                options: [
                  { value: 'false', label: 'Core' },
                  { value: 'true', label: 'Elective' },
                ],
              },
            ]}
          />
        }
      />
      <SubjectDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        subject={dialog.subject}
      />
      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => !open && setArchiving(undefined)}
        title={`Archive ${archiving?.name ?? 'subject'}?`}
        description="It disappears from lists and from teachers' subject lists. Restoring it later brings those assignments back."
        confirmLabel="Archive subject"
        destructive
        pending={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
      />
    </div>
  );
}

const subjectSchema = z.object({
  name: z.string().trim().min(1, 'Give the subject a name').max(80),
  code: z
    .string()
    .trim()
    .min(1, 'A short code is required')
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only'),
  isElective: z.boolean(),
  description: z.string().trim().max(300),
});
type SubjectValues = z.infer<typeof subjectSchema>;

/** "Computer Science" → "CS", "Mathematics" → "MATH" — a starting point the user can change. */
function suggestCode(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').toUpperCase().slice(0, 6);
  return (words[0] ?? '').slice(0, 4).toUpperCase();
}

function SubjectDialog({
  open,
  onOpenChange,
  subject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject?: Subject;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(subject);
  const form = useForm<SubjectValues>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: '', code: '', isElective: false, description: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: subject?.name ?? '',
        code: subject?.code ?? '',
        isElective: subject?.isElective ?? false,
        description: subject?.description ?? '',
      });
    }
  }, [open, subject, form]);

  const mutation = useMutation({
    mutationFn: (values: SubjectValues) => {
      const payload = { ...values, description: values.description || undefined };
      return isEdit ? updateSubject(subject!._id, payload) : createSubject(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast.success(isEdit ? 'Subject updated' : 'Subject created');
      onOpenChange(false);
    },
    onError: (error) => applyServerError(error, form.setError, ['name', 'code'], "Couldn't save the subject"),
  });

  const { errors, isSubmitting, dirtyFields } = form.formState;
  const nameField = form.register('name', {
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (!isEdit && !dirtyFields.code && !form.getValues('code')) {
        form.setValue('code', suggestCode(e.target.value), { shouldValidate: true });
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit subject' : 'New subject'}</DialogTitle>
          <DialogDescription>Codes appear on timetables and report cards, so keep them short.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Subject name" error={errors.name?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} aria-invalid={!!errors.name} autoFocus {...nameField} />
              )}
            </Field>
            <Field label="Code" error={errors.code?.message} required>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={!!errors.code}
                  className="font-mono uppercase"
                  {...form.register('code')}
                />
              )}
            </Field>
          </div>
          <Field label="Description" error={errors.description?.message}>
            {({ id, describedBy }) => <Textarea id={id} rows={2} aria-describedby={describedBy} {...form.register('description')} />}
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="accent-primary mt-0.5 size-4" {...form.register('isElective')} />
            <span>
              <span className="font-medium">Elective</span>
              <span className="text-muted-foreground block text-xs">Students choose it, rather than everyone taking it.</span>
            </span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create subject'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
