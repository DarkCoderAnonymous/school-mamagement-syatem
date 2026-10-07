'use client';

import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { usePermission } from '@/lib/permissions';
import { errorMessage } from '@/lib/form-errors';
import { getExamSettings, updateExamSettings } from '@/lib/api/exams';

interface Values {
  bands: { grade: string; minPercent: number; remark: string }[];
  showPositions: boolean;
}

/**
 * The school's grading scale. Each grade covers its minimum up to the next
 * grade's; the ranges are shown live so a gap or overlap is obvious. Already
 * published results keep the grades they were given.
 */
export function GradingTab() {
  const can = usePermission();
  const readOnly = !can(Permission.EXAM_CREATE);
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['exam-settings'], queryFn: getExamSettings });
  const form = useForm<Values>({ defaultValues: { bands: [], showPositions: true } });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'bands' });
  const bands = useWatch({ control: form.control, name: 'bands' });

  useEffect(() => {
    if (query.data) {
      form.reset({
        bands: query.data.gradingBands.map((b) => ({ grade: b.grade, minPercent: b.minPercent, remark: b.remark ?? '' })),
        showPositions: query.data.showPositions,
      });
    }
  }, [query.data, form]);

  // Each row's range: from its minimum up to just under the next-higher minimum.
  const ranges = useMemo(() => {
    const mins = (bands ?? []).map((b) => Number(b?.minPercent));
    return mins.map((min) => {
      const higher = mins.filter((m) => m > min);
      return higher.length ? `${min}% – ${Math.min(...higher)}%` : `${min}% – 100%`;
    });
  }, [bands]);
  const hasZero = (bands ?? []).some((b) => Number(b?.minPercent) === 0);

  const mutation = useMutation({
    mutationFn: (v: Values) =>
      updateExamSettings({
        gradingBands: v.bands.map((b) => ({ grade: b.grade.trim(), minPercent: Number(b.minPercent), remark: b.remark.trim() || undefined })),
        showPositions: v.showPositions,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['exam-settings'] });
      toast.success('Grading scale saved', { description: 'It applies to results published from now on.' });
    },
    onError: (e) => toast.error(errorMessage(e, "Couldn't save the grading scale")),
  });

  if (query.isLoading) return <Skeleton className="h-80 w-full max-w-2xl rounded-xl" />;
  if (query.isError) {
    return (
      <div className="max-w-2xl rounded-xl border">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} title="Couldn't load the grading scale" />
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} className="max-w-2xl space-y-6">
      <section className="bg-card space-y-4 rounded-xl border p-5">
        <div>
          <h3 className="font-semibold">Grades</h3>
          <p className="text-muted-foreground text-sm">Used for each subject and for the overall result. Published report cards keep the grades they were given.</p>
        </div>
        <fieldset disabled={readOnly} className="space-y-2">
          <div className="text-muted-foreground grid grid-cols-[5rem_6rem_1fr_7rem_auto] gap-2 px-1 text-xs font-medium">
            <span>Grade</span>
            <span>From (%)</span>
            <span>Remark</span>
            <span>Range</span>
            <span className="w-9" />
          </div>
          {fields.map((f, i) => (
            <div key={f.id} className="grid grid-cols-[5rem_6rem_1fr_7rem_auto] items-center gap-2">
              <Input aria-label="Grade" className="font-semibold" {...form.register(`bands.${i}.grade`, { required: true })} />
              <Input aria-label="Minimum percent" type="number" min={0} max={100} step="0.5" {...form.register(`bands.${i}.minPercent`, { valueAsNumber: true })} />
              <Input aria-label="Remark" placeholder="e.g. Excellent" {...form.register(`bands.${i}.remark`)} />
              <span className="text-muted-foreground text-xs tabular-nums">{ranges[i]}</span>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove grade" disabled={fields.length <= 2} onClick={() => remove(i)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {!hasZero && <p className="text-destructive text-xs">One grade must start at 0% so every score gets a grade.</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => append({ grade: '', minPercent: 0, remark: '' })}>
            <Plus className="size-3.5" />
            Add grade
          </Button>
        </fieldset>
      </section>

      <section className="bg-card rounded-xl border p-5">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="accent-primary mt-0.5 size-4" disabled={readOnly} {...form.register('showPositions')} />
          <span>
            <span className="block text-sm font-medium">Show positions</span>
            <span className="text-muted-foreground block text-sm">Class and section positions on result sheets and report cards.</span>
          </span>
        </label>
      </section>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" disabled={mutation.isPending || !form.formState.isDirty || !hasZero}>
            {mutation.isPending ? 'Saving…' : 'Save grading scale'}
          </Button>
        </div>
      )}
    </form>
  );
}
