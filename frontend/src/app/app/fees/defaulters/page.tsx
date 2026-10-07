'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { HandCoins, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useUrlState } from '@/hooks/use-url-state';
import { useClassOptions } from '@/hooks/use-school-options';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName } from '@/lib/labels';
import { listDefaulters, sendReminders } from '@/lib/api/finance';
import type { Defaulter } from '@/lib/api/types';
import { StudentLink } from '@/components/students/student-quick-view';

export default function DefaultersPage() {
  const url = useUrlState();
  const can = usePermission();
  const canCollect = can(Permission.FEE_PAYMENT_RECORD);
  const fmt = useSchoolFormat();
  const classes = useClassOptions();
  const [confirm, setConfirm] = useState<{ ids?: string[]; clear?: () => void } | null>(null);
  const params = { page: url.getNumber('page', 1), limit: url.getNumber('limit', 25), classId: url.get('classId'), search: url.get('search') };
  const query = useQuery({ queryKey: ['fee-defaulters', params], queryFn: () => listDefaulters(params) });
  const total = (query.data?.meta as { totalOverdueMinor?: number } | undefined)?.totalOverdueMinor ?? 0;

  const remind = useMutation({
    mutationFn: (ids?: string[]) => sendReminders(ids),
    onSuccess: (r) => {
      toast.success(`${r.sent} reminder${r.sent === 1 ? '' : 's'} sent`, {
        description: r.skippedNoEmail ? `${r.skippedNoEmail} families have no email on file — call them instead.` : undefined,
      });
      confirm?.clear?.();
      setConfirm(null);
    },
    onError: (e) => {
      toast.error(errorMessage(e, "Couldn't send reminders"));
      setConfirm(null);
    },
  });

  const columns = useMemo<DataTableColumn<Defaulter>[]>(
    () => [
      {
        id: 'student',
        header: 'Student',
        cell: ({ row }) => (
          <div className="min-w-0">
            <StudentLink studentId={row.original._id} tab="fees" filters={{ invoices: 'OVERDUE' }} className="block truncate font-medium">
              {fullName(row.original.student)}
            </StudentLink>
            <p className="text-muted-foreground text-xs">
              {row.original.student?.admissionNumber} · {row.original.student?.classId?.name}
              {row.original.student?.sectionId ? ` ${row.original.student.sectionId.name}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'contact',
        header: 'Primary contact',
        cell: ({ row }) => {
          const c = row.original.primaryContact;
          return c ? (
            <div className="min-w-0 text-sm">
              <p className="truncate">{fullName(c)}</p>
              <p className="text-muted-foreground flex items-center gap-2 text-xs">
                <a href={`tel:${c.phone}`} className="hover:text-primary inline-flex items-center gap-1 tabular-nums" onClick={(e) => e.stopPropagation()}>
                  <Phone className="size-3" aria-hidden="true" />
                  {c.phone}
                </a>
                {c.email ? <Mail className="size-3" aria-label="Has email" /> : <span>no email</span>}
              </p>
            </div>
          ) : (
            '—'
          );
        },
      },
      { id: 'invoices', header: 'Invoices', cell: ({ row }) => <span className="tabular-nums">{row.original.invoiceCount}</span> },
      {
        id: 'days',
        header: 'Overdue since',
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.date(row.original.oldestDueDate)} <span className="text-muted-foreground text-xs">({row.original.daysOverdue}d)</span>
          </span>
        ),
      },
      {
        id: 'overdue',
        header: 'Overdue',
        cell: ({ row }) => <span className="text-destructive font-medium tabular-nums">{fmt.money(row.original.overdueMinor)}</span>,
      },
      ...(canCollect
        ? [
            {
              id: 'collect',
              header: '',
              cell: ({ row }: { row: { original: Defaulter } }) => (
                <Link
                  href={`/app/fees/collect?studentId=${row.original._id}`}
                  onClick={(e) => e.stopPropagation()}
                  className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  aria-label={`Collect fees from ${fullName(row.original.student)}`}
                >
                  <HandCoins className="size-3.5" aria-hidden="true" />
                  Collect
                </Link>
              ),
            },
          ]
        : []),
    ],
    [fmt, canCollect],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Defaulters"
        description={query.data ? `${query.data.meta.total} students owe ${fmt.money(total)} past its due date.` : 'Students with fees past their due date.'}
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Defaulters' }]}
        action={
          can(Permission.FEE_REPORT_READ) && query.data && query.data.meta.total > 0 ? (
            <Button onClick={() => setConfirm({})}>
              <Mail className="size-4" />
              Remind everyone
            </Button>
          ) : undefined
        }
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(r) => r._id}
        enableSelection
        bulkActions={(ids, clear) => (
          <Button size="sm" onClick={() => setConfirm({ ids, clear })}>
            <Mail className="size-3.5" />
            Remind {ids.length}
          </Button>
        )}
        exportFileName="defaulters"
        emptyTitle="Nobody is overdue"
        emptyDescription="Every invoice past its due date has been paid."
        toolbar={<FilterBar searchPlaceholder="Search student…" filters={[{ key: 'classId', label: 'Class', options: (classes.data ?? []).map((c) => ({ value: c._id, label: c.name })) }]} />}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.ids ? `Email ${confirm.ids.length} families?` : 'Email every overdue family?'}
        description="Each primary guardian with an email gets a reminder with their overdue total. Families without an email are listed so you can call them."
        confirmLabel="Send reminders"
        pending={remind.isPending}
        onConfirm={() => remind.mutate(confirm?.ids)}
      />
    </div>
  );
}
