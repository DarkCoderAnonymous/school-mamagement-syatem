'use client';

import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Ban, Landmark, Plus, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { fullName, monthLabel, PAYMENT_METHOD_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import {
  createFinanceCategory,
  createLedgerEntry,
  getFinanceSummary,
  listFinanceCategories,
  listLedgerEntries,
  voidLedgerEntry,
} from '@/lib/api/finance';
import type { LedgerEntry, LedgerType, PaymentMethod } from '@/lib/api/types';

export default function FinancePage() {
  const url = useUrlState();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const tab = url.get('tab') ?? 'entries';
  const [recording, setRecording] = useState<LedgerType | null>(null);
  const [voiding, setVoiding] = useState<LedgerEntry>();
  const [voidReason, setVoidReason] = useState('');

  const summary = useQuery({ queryKey: ['finance', 'summary'], queryFn: () => getFinanceSummary(6) });
  const categories = useQuery({ queryKey: ['finance', 'categories'], queryFn: () => listFinanceCategories({ limit: 100 }) });
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    search: url.get('search'),
    type: url.get('type'),
    categoryId: url.get('categoryId'),
    includeVoided: url.get('includeVoided'),
  };
  const entries = useQuery({ queryKey: ['finance', 'entries', params], queryFn: () => listLedgerEntries(params) });

  const voidEntry = useMutation({
    mutationFn: (e: LedgerEntry) => voidLedgerEntry(e._id, voidReason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
      toast.success('Entry voided');
      setVoiding(undefined);
      setVoidReason('');
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't void the entry")),
  });

  const columns = useMemo<DataTableColumn<LedgerEntry>[]>(
    () => [
      { id: 'date', header: 'Date', cell: ({ row }) => <span className="tabular-nums">{fmt.date(row.original.date)}</span> },
      {
        id: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <div className={cn('min-w-0', row.original.voidedAt && 'line-through opacity-60')}>
            <p className="truncate font-medium">{row.original.description}</p>
            <p className="text-muted-foreground truncate text-xs">
              {row.original.categoryId?.name}
              {row.original.party ? ` · ${row.original.party}` : ''}
              {row.original.source === 'PAYROLL' ? ' · from payroll' : ''}
            </p>
          </div>
        ),
      },
      { id: 'method', header: 'Paid by', cell: ({ row }) => PAYMENT_METHOD_LABEL[row.original.method] },
      { id: 'by', header: 'Recorded by', cell: ({ row }) => fullName(row.original.recordedByUserId) },
      {
        id: 'amount',
        header: 'Amount',
        cell: ({ row }) =>
          row.original.voidedAt ? (
            <StatusBadge status="CANCELLED" label="Voided" />
          ) : (
            <span className={cn('block text-right font-medium tabular-nums', row.original.type === 'INCOME' ? 'text-success' : '')}>
              {row.original.type === 'INCOME' ? '+' : '−'}
              {fmt.money(row.original.amountMinor)}
            </span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          !row.original.voidedAt && row.original.source === 'MANUAL' && can(Permission.FINANCE_MANAGE) ? (
            <div className="flex justify-end">
              <Button variant="ghost" size="icon-sm" aria-label="Void entry" onClick={() => setVoiding(row.original)}>
                <Ban className="size-4" />
              </Button>
            </div>
          ) : null,
      },
    ],
    [can, fmt],
  );

  const s = summary.data;
  const maxBar = Math.max(1, ...(s?.months.flatMap((m) => [m.feeIncomeMinor + m.otherIncomeMinor, m.expenseMinor]) ?? [1]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses & income"
        description="Money the school spends, and income other than fees. Fee collections are included in the totals from their own receipts."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Expenses & income' }]}
        action={
          <PermissionGate permission={Permission.FINANCE_RECORD}>
            <Button variant="outline" onClick={() => setRecording('INCOME')}>
              <ArrowDownRight className="size-4" />
              Income
            </Button>
            <Button onClick={() => setRecording('EXPENSE')}>
              <Plus className="size-4" />
              Record expense
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Fee income (6 mo.)" value={s ? fmt.money(s.totals.feeIncomeMinor) : '—'} icon={Landmark} loading={summary.isLoading} />
        <StatCard label="Other income" value={s ? fmt.money(s.totals.otherIncomeMinor) : '—'} icon={ArrowDownRight} loading={summary.isLoading} />
        <StatCard label="Expenses" value={s ? fmt.money(s.totals.expenseMinor) : '—'} icon={ArrowUpRight} loading={summary.isLoading} />
        <StatCard label="Net" value={s ? fmt.money(s.totals.netMinor) : '—'} icon={Scale} tone={s && s.totals.netMinor < 0 ? 'danger' : 'success'} loading={summary.isLoading} />
      </div>

      {s && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="bg-card space-y-3 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Last 6 months</h2>
              <p className="text-muted-foreground flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1"><span className="bg-primary size-2 rounded-full" />Income</span>
                <span className="flex items-center gap-1"><span className="bg-warning size-2 rounded-full" />Expenses</span>
              </p>
            </div>
            <ul className="space-y-3">
              {s.months.map((m) => (
                <li key={m.month} className="grid grid-cols-[6rem_1fr_6.5rem] items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{monthLabel(m.month).replace(/ \d{4}$/, '')}</span>
                  <span className="space-y-1" aria-hidden="true">
                    <span className="bg-muted block h-2 overflow-hidden rounded-full">
                      <span className="bg-primary block h-full origin-left rounded-full" style={{ transform: `scaleX(${(m.feeIncomeMinor + m.otherIncomeMinor) / maxBar})` }} />
                    </span>
                    <span className="bg-muted block h-2 overflow-hidden rounded-full">
                      <span className="bg-warning block h-full origin-left rounded-full" style={{ transform: `scaleX(${m.expenseMinor / maxBar})` }} />
                    </span>
                  </span>
                  <span className={cn('text-right tabular-nums', m.netMinor < 0 && 'text-destructive')}>{fmt.money(m.netMinor)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="bg-card space-y-3 rounded-xl border p-5">
            <h2 className="text-sm font-semibold">Spending by category</h2>
            {s.byCategory.filter((c) => c.type === 'EXPENSE').length === 0 ? (
              <p className="text-muted-foreground text-sm">No expenses recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {s.byCategory
                  .filter((c) => c.type === 'EXPENSE')
                  .map((c) => (
                    <li key={c.categoryId} className="flex justify-between gap-3">
                      <span className="truncate">{c.name}</span>
                      <span className="tabular-nums">{fmt.money(c.amountMinor)}</span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => url.set({ tab: v === 'entries' ? undefined : String(v), page: undefined })}>
        <TabsList>
          <TabsTrigger value="entries">Ledger</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>
        <TabsContent value="entries" className="pt-4">
          <DataTable
            columns={columns}
            data={entries.data?.items}
            meta={entries.data?.meta}
            loading={entries.isLoading}
            error={entries.error}
            onRetry={() => void entries.refetch()}
            getRowId={(r) => r._id}
            exportFileName="ledger"
            emptyTitle="Nothing recorded yet"
            emptyDescription="Record bills, repairs and purchases as expenses; donations and rentals as income."
            toolbar={
              <FilterBar
                searchPlaceholder="Search description, payee or reference…"
                filters={[
                  { key: 'type', label: 'Type', options: [{ value: 'EXPENSE', label: 'Expenses' }, { value: 'INCOME', label: 'Income' }] },
                  { key: 'categoryId', label: 'Category', options: (categories.data?.items ?? []).map((c) => ({ value: c._id, label: c.name })) },
                  { key: 'includeVoided', label: 'Voided', options: [{ value: 'true', label: 'Include voided' }] },
                ]}
              />
            }
          />
        </TabsContent>
        <TabsContent value="categories" className="pt-4">
          <CategoriesPanel />
        </TabsContent>
      </Tabs>

      <EntryDialog type={recording} onClose={() => setRecording(null)} />
      <ConfirmDialog
        open={Boolean(voiding)}
        onOpenChange={(o) => !o && setVoiding(undefined)}
        title="Void this entry?"
        description="It stays in the ledger, struck through, and stops counting in totals. Record a corrected entry if needed."
        confirmLabel="Void entry"
        destructive
        pending={voidEntry.isPending}
        onConfirm={() => {
          if (voidReason.trim().length >= 3 && voiding) voidEntry.mutate(voiding);
          else toast.error('Give a reason (3+ characters)');
        }}
      >
        <Input aria-label="Reason" placeholder="Reason, e.g. entered twice" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
}

function CategoriesPanel() {
  const queryClient = useQueryClient();
  const can = usePermission();
  const [name, setName] = useState('');
  const [type, setType] = useState<LedgerType>('EXPENSE');
  const categories = useQuery({ queryKey: ['finance', 'categories'], queryFn: () => listFinanceCategories({ limit: 100 }) });
  const create = useMutation({
    mutationFn: () => createFinanceCategory({ name, type }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance', 'categories'] });
      toast.success('Category added');
      setName('');
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't add the category")),
  });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(['EXPENSE', 'INCOME'] as const).map((t) => (
        <section key={t} className="bg-card space-y-3 rounded-xl border p-5">
          <h3 className="font-semibold">{t === 'EXPENSE' ? 'Expense categories' : 'Income categories'}</h3>
          <ul className="flex flex-wrap gap-2">
            {categories.data?.items
              .filter((c) => c.type === t)
              .map((c) => (
                <li key={c._id} className="bg-muted rounded-md px-2.5 py-1 text-sm">
                  {c.name}
                  {c.isSystem && <span className="text-muted-foreground text-xs"> · system</span>}
                </li>
              ))}
          </ul>
        </section>
      ))}
      {can(Permission.FINANCE_MANAGE) && (
        <form
          className="bg-card flex flex-wrap items-end gap-3 rounded-xl border p-5 md:col-span-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field label="New category" className="min-w-48 flex-1">{({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Utilities" />}</Field>
          <Field label="Type">
            {({ id }) => (
              <NativeSelect id={id} value={type} onChange={(e) => setType(e.target.value as LedgerType)}>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </NativeSelect>
            )}
          </Field>
          <Button type="submit" disabled={!name.trim() || create.isPending}>Add</Button>
        </form>
      )}
    </div>
  );
}

interface EntryValues {
  categoryId: string;
  amountMinor: number;
  date: string;
  description: string;
  party: string;
  method: PaymentMethod;
  reference: string;
}

function EntryDialog({ type, onClose }: { type: LedgerType | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const categories = useQuery({ queryKey: ['finance', 'categories'], queryFn: () => listFinanceCategories({ limit: 100 }), enabled: Boolean(type) });
  const options = (categories.data?.items ?? []).filter((c) => c.type === type && !c.isSystem);
  const form = useForm<EntryValues>();
  const amount = useWatch({ control: form.control, name: 'amountMinor' });
  useEffect(() => {
    if (type) form.reset({ categoryId: '', amountMinor: 0, date: new Date().toISOString().slice(0, 10), description: '', party: '', method: 'CASH', reference: '' });
  }, [type, form]);
  const mutation = useMutation({
    mutationFn: (v: EntryValues) =>
      createLedgerEntry({
        type: type!,
        categoryId: v.categoryId,
        amountMinor: v.amountMinor,
        date: new Date(`${v.date}T00:00:00.000Z`).toISOString(),
        description: v.description,
        party: v.party || undefined,
        method: v.method,
        reference: v.reference || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['finance'] });
      toast.success(type === 'EXPENSE' ? 'Expense recorded' : 'Income recorded');
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't record it")),
  });
  return (
    <Dialog open={Boolean(type)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{type === 'EXPENSE' ? 'Record an expense' : 'Record income'}</DialogTitle>
          <DialogDescription>{type === 'EXPENSE' ? 'A bill paid, a repair, a purchase.' : 'Money in that isn’t a fee — a donation, a hall rental.'}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" required help={options.length === 0 ? 'Add a category on the Categories tab first.' : undefined}>
              {({ id, describedBy }) => (
                <NativeSelect id={id} aria-describedby={describedBy} required {...form.register('categoryId', { required: true })}>
                  <option value="">Select…</option>
                  {options.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Amount" required>{({ id }) => <Controller control={form.control} name="amountMinor" render={({ field }) => <MoneyInput id={id} value={field.value} onChange={field.onChange} />} />}</Field>
            <Field label="Date" required>{({ id }) => <Input id={id} type="date" max={new Date().toISOString().slice(0, 10)} required {...form.register('date', { required: true })} />}</Field>
            <Field label="Paid by">
              {({ id }) => (
                <NativeSelect id={id} {...form.register('method')}>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          </div>
          <Field label="Description" required>{({ id }) => <Input id={id} required placeholder={type === 'EXPENSE' ? 'e.g. Electricity bill — August' : 'e.g. Alumni donation for library'} {...form.register('description', { required: true })} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={type === 'EXPENSE' ? 'Paid to' : 'Received from'}>{({ id }) => <Input id={id} {...form.register('party')} />}</Field>
            <Field label="Reference" help="Bill, invoice or cheque number.">{({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...form.register('reference')} />}</Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending || !amount}>{mutation.isPending ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
