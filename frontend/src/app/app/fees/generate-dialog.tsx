'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { ToggleChip } from '@/components/form/toggle-chip';
import { useClassOptions } from '@/hooks/use-school-options';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { monthLabel } from '@/lib/labels';
import { generateInvoices, listFeeHeads, previewInvoices, type GenerateInput } from '@/lib/api/finance';
import type { GenerationPreview } from '@/lib/api/types';

const thisMonth = () => new Date().toISOString().slice(0, 7);
const addDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * Two steps: choose what to bill, then see exactly what will be created
 * (the preview runs the same code as the real generation) before committing.
 */
export function GenerateInvoicesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const classes = useClassOptions(open);
  const heads = useQuery({ queryKey: ['fee-heads', 'all'], queryFn: () => listFeeHeads({ limit: 100 }), enabled: open });

  // null = untouched: every class, and the monthly heads, are selected by default.
  const [pickedClassIds, setClassIds] = useState<string[] | null>(null);
  const [pickedHeadIds, setHeadIds] = useState<string[] | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const [label, setLabel] = useState(monthLabel(thisMonth()));
  const [labelTouched, setLabelTouched] = useState(false);
  const [dueDate, setDueDate] = useState(addDays(10));
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start fresh each time the dialog opens (adjusted during render, not in an effect).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setClassIds(null);
      setHeadIds(null);
      setPreview(null);
      setError(null);
      setMonth(thisMonth());
      setLabel(monthLabel(thisMonth()));
      setLabelTouched(false);
      setDueDate(addDays(10));
    }
  }

  const classIds = useMemo(() => pickedClassIds ?? (classes.data ?? []).map((c) => c._id), [pickedClassIds, classes.data]);
  const headIds = useMemo(
    () => pickedHeadIds ?? (heads.data?.items ?? []).filter((h) => h.frequency === 'MONTHLY').map((h) => h._id),
    [pickedHeadIds, heads.data],
  );

  const input: GenerateInput = useMemo(
    () => ({ classIds, feeHeadIds: headIds, periodKey: month, periodLabel: label, dueDate }),
    [classIds, headIds, month, label, dueDate],
  );
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const previewMutation = useMutation({
    mutationFn: () => previewInvoices(input),
    onSuccess: (data) => {
      setError(null);
      setPreview(data);
    },
    onError: (e) => setError(errorMessage(e, "Couldn't preview")),
  });
  const generate = useMutation({
    mutationFn: () => generateInvoices(input),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['fee-invoices'] });
      await queryClient.invalidateQueries({ queryKey: ['fee-summary'] });
      toast.success(`${res.invoiceCount} invoices created`, { description: `${fmt.money(res.totalMinor)} billed for ${label}.` });
      onOpenChange(false);
    },
    onError: (e) => setError(errorMessage(e, "Couldn't generate the invoices")),
  });

  const canPreview = classIds.length > 0 && headIds.length > 0 && month && label.trim() && dueDate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{preview ? 'Check and generate' : 'Generate invoices'}</DialogTitle>
          <DialogDescription>
            {preview
              ? 'Nothing has been created yet. Students already billed for this period are skipped.'
              : 'Bill a period for one or more classes, from their fee structures and each student’s concessions.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="bg-destructive-soft text-destructive animate-shake flex items-start gap-2 rounded-lg px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {!preview ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Billing month" help="Each student gets one invoice per period.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="month"
                    aria-describedby={describedBy}
                    value={month}
                    onChange={(e) => {
                      setMonth(e.target.value);
                      if (!labelTouched) setLabel(monthLabel(e.target.value));
                    }}
                  />
                )}
              </Field>
              <Field label="Label on the bill">
                {({ id }) => (
                  <Input
                    id={id}
                    value={label}
                    onChange={(e) => {
                      setLabel(e.target.value);
                      setLabelTouched(true);
                    }}
                  />
                )}
              </Field>
              <Field label="Due date">
                {({ id }) => <Input id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
              </Field>
            </div>

            <fieldset className="space-y-2">
              <legend className="flex w-full items-center justify-between text-[0.8125rem] font-medium">
                Classes
                <button type="button" className="text-primary text-xs hover:underline" onClick={() => setClassIds(classIds.length === (classes.data?.length ?? 0) ? [] : (classes.data ?? []).map((c) => c._id))}>
                  {classIds.length === (classes.data?.length ?? 0) ? 'Clear all' : 'Select all'}
                </button>
              </legend>
              <div className="flex flex-wrap gap-2">
                {classes.data?.map((c) => (
                  <ToggleChip key={c._id} on={classIds.includes(c._id)} onClick={() => setClassIds(toggle(classIds, c._id))}>
                    {c.name} <span className="opacity-70">· {c.studentCount}</span>
                  </ToggleChip>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-2">
              <legend className="text-[0.8125rem] font-medium">Fees to bill</legend>
              <div className="flex flex-wrap gap-2">
                {heads.data?.items.map((h) => (
                  <ToggleChip key={h._id} on={headIds.includes(h._id)} onClick={() => setHeadIds(toggle(headIds, h._id))}>
                    {h.name}
                  </ToggleChip>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">Monthly fees are pre-selected. Tick annual or one-time fees only in the run that should charge them.</p>
            </fieldset>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-muted/60 grid grid-cols-2 gap-3 rounded-lg p-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Invoices to create</p>
                <p className="text-2xl font-semibold tabular-nums">{preview.invoiceCount}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Total billed (after concessions)</p>
                <p className="text-2xl font-semibold tabular-nums">{fmt.money(preview.totalMinor)}</p>
              </div>
            </div>
            <ul className="divide-y rounded-lg border text-sm">
              {preview.classes.map((c) => (
                <li key={c.classId} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{c.className}</p>
                    {c.skippedReason ? (
                      <p className="text-warning-ink text-xs">{c.skippedReason}</p>
                    ) : (
                      <p className="text-muted-foreground truncate text-xs">{c.lines.map((l) => `${l.name} ${fmt.money(l.amountMinor)}`).join(' · ')}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p>{c.toBill} of {c.students} students</p>
                    {c.alreadyBilled > 0 && <p className="text-muted-foreground text-xs">{c.alreadyBilled} already billed</p>}
                    {c.toBill > 0 && <p className="text-xs font-medium">{fmt.money(c.totalMinor)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <DialogFooter>
          {preview ? (
            <>
              <Button type="button" variant="outline" onClick={() => setPreview(null)} disabled={generate.isPending}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={() => generate.mutate()} disabled={generate.isPending || preview.invoiceCount === 0}>
                {generate.isPending ? 'Generating…' : `Generate ${preview.invoiceCount} invoices`}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => previewMutation.mutate()} disabled={!canPreview || previewMutation.isPending}>
                {previewMutation.isPending ? 'Checking…' : 'Preview'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
