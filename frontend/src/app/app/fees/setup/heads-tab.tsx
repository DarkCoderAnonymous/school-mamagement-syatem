'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { usePermission } from '@/lib/permissions';
import { applyServerError, errorMessage } from '@/lib/form-errors';
import { archiveFeeHead, createFeeHead, listFeeHeads, updateFeeHead } from '@/lib/api/finance';
import type { FeeHead } from '@/lib/api/types';

export const FREQUENCY_LABEL = { MONTHLY: 'Monthly', TERM: 'Per term', ANNUAL: 'Annual', ONE_TIME: 'One-time' } as const;

export function FeeHeadsTab() {
  const can = usePermission();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; head?: FeeHead }>({ open: false });
  const [archiving, setArchiving] = useState<FeeHead>();
  const query = useQuery({ queryKey: ['fee-heads', 'all'], queryFn: () => listFeeHeads({ limit: 100 }) });

  const archive = useMutation({
    mutationFn: (h: FeeHead) => archiveFeeHead(h._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-heads'] });
      toast.success('Fee head archived');
      setArchiving(undefined);
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't archive it")),
  });

  const columns = useMemo<DataTableColumn<FeeHead>[]>(
    () => [
      { id: 'name', header: 'Fee head', cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
      { id: 'code', header: 'Code', cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
      { id: 'frequency', header: 'Usually billed', cell: ({ row }) => FREQUENCY_LABEL[row.original.frequency] },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          can(Permission.FEE_STRUCTURE_MANAGE) ? (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger className="hover:bg-muted inline-flex size-8 items-center justify-center rounded-md" aria-label={`Actions for ${row.original.name}`}>
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDialog({ open: true, head: row.original })}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setArchiving(row.original)}>Archive</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null,
      },
    ],
    [can],
  );

  const add = (
    <PermissionGate permission={Permission.FEE_STRUCTURE_MANAGE}>
      <Button onClick={() => setDialog({ open: true })}>
        <Plus className="size-4" />
        New fee head
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">The kinds of charges your school bills — each class structure sets an amount for them.</p>
        {add}
      </div>
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(r) => r._id}
        emptyTitle="No fee heads yet"
        emptyDescription="Start with Tuition, then add Admission, Exam or Lab fees as you need them."
        emptyAction={add}
      />
      <HeadDialog open={dialog.open} head={dialog.head} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} />
      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(o) => !o && setArchiving(undefined)}
        title={`Archive ${archiving?.name ?? 'fee head'}?`}
        description="Refused while any class fee structure still charges it. Issued invoices are unaffected."
        confirmLabel="Archive"
        destructive
        pending={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
      />
    </div>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code: z.string().trim().min(1, 'Code is required').max(12).regex(/^[A-Za-z0-9-]+$/, 'Letters, numbers and dashes only'),
  frequency: z.enum(['MONTHLY', 'TERM', 'ANNUAL', 'ONE_TIME']),
});
type Values = z.infer<typeof schema>;

function HeadDialog({ open, head, onOpenChange }: { open: boolean; head?: FeeHead; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const form = useForm<Values>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (open) form.reset({ name: head?.name ?? '', code: head?.code ?? '', frequency: head?.frequency ?? 'MONTHLY' });
  }, [open, head, form]);
  const mutation = useMutation({
    mutationFn: (v: Values) => (head ? updateFeeHead(head._id, v) : createFeeHead(v)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['fee-heads'] });
      toast.success(head ? 'Fee head updated' : 'Fee head created');
      onOpenChange(false);
    },
    onError: (e) => applyServerError(e, form.setError, ['name', 'code'], "Couldn't save the fee head"),
  });
  const { errors, isSubmitting } = form.formState;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{head ? 'Edit fee head' : 'New fee head'}</DialogTitle>
          <DialogDescription>Amounts are set per class, in fee structures.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="Name" error={errors.name?.message} required>
              {({ id, describedBy }) => <Input id={id} autoFocus aria-describedby={describedBy} aria-invalid={!!errors.name} {...form.register('name')} />}
            </Field>
            <Field label="Code" error={errors.code?.message} required>
              {({ id, describedBy }) => <Input id={id} className="font-mono uppercase" aria-describedby={describedBy} aria-invalid={!!errors.code} {...form.register('code')} />}
            </Field>
          </div>
          <Field label="Usually billed" help="Pre-selects this head when you generate invoices for that kind of period.">
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} {...form.register('frequency')}>
                {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
