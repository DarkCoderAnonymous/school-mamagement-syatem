'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { CalendarOff, Trash2 } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { usePermission } from '@/lib/permissions';
import { applyServerError, errorMessage } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { createHoliday, deleteHoliday, getAttendanceSettings, listHolidays, updateAttendanceSettings } from '@/lib/api/school';
import type { AttendanceSettings, Holiday } from '@/lib/api/types';
import { longDate } from '../attendance/date-nav';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The school calendar attendance runs on: the weekly days off, how far back
 * a teacher may catch up missed registers, and the holidays. The office
 * edits it; everyone who sees attendance can read it.
 */
export default function HolidaysPage() {
  const can = usePermission();
  const canEdit = can(Permission.ATTENDANCE_MANAGE);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays & days off"
        description="No register is taken on these days, and they don’t count against a teacher’s catch-up window."
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Attendance', href: '/app/attendance' },
          { label: 'Holidays & days off' },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <SchoolWeekCard canEdit={canEdit} />
        <HolidaysCard canEdit={canEdit} />
      </div>
    </div>
  );
}

function SchoolWeekCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['attendance-settings'], queryFn: getAttendanceSettings });
  const [draft, setDraft] = useState<AttendanceSettings>();
  const value = draft ?? settings.data;

  const save = useMutation({
    mutationFn: (v: AttendanceSettings) => updateAttendanceSettings(v),
    onSuccess: async (saved) => {
      queryClient.setQueryData(['attendance-settings'], saved);
      setDraft(undefined);
      await queryClient.invalidateQueries({ queryKey: ['attendance-board'] });
      toast.success('School week saved');
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't save the school week")),
  });

  return (
    <Card className="h-fit">
      <CardContent className="space-y-5 p-6">
        <h2 className="font-semibold">School week</h2>
        {settings.isLoading || !value ? (
          settings.isError ? (
            <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <Skeleton className="h-40 w-full" />
          )
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-[0.8125rem] font-medium">Weekly days off</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((name, day) => {
                  const off = value.weeklyOffDays.includes(day);
                  return (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={off}
                      disabled={!canEdit}
                      onClick={() =>
                        setDraft({ ...value, weeklyOffDays: off ? value.weeklyOffDays.filter((d) => d !== day) : [...value.weeklyOffDays, day] })
                      }
                      className={cn(
                        'focus-visible:ring-ring rounded-md border px-2.5 py-1 text-sm transition-colors outline-none focus-visible:ring-2 disabled:cursor-default',
                        off ? 'border-primary bg-primary text-primary-foreground' : 'enabled:hover:bg-muted',
                      )}
                    >
                      {name.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                {value.weeklyOffDays.length ? `Closed every ${value.weeklyOffDays.map((d) => WEEKDAYS[d]).join(' and ')}.` : 'Open every day of the week.'}
              </p>
            </fieldset>

            <Field label="Teachers can catch up" help="How many school days back a teacher may still take a missed register — after leave, say. The office can always correct any day.">
              {({ id, describedBy }) => (
                <NativeSelect
                  id={id}
                  aria-describedby={describedBy}
                  disabled={!canEdit}
                  value={String(value.teacherBackdateDays)}
                  onChange={(e) => setDraft({ ...value, teacherBackdateDays: Number(e.target.value) })}
                >
                  <option value="0">Today only</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} school day{n === 1 ? '' : 's'} back
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>

            {canEdit && (
              <div className="flex justify-end gap-2">
                {draft && (
                  <Button variant="ghost" onClick={() => setDraft(undefined)} disabled={save.isPending}>
                    Discard
                  </Button>
                )}
                <Button onClick={() => draft && save.mutate(draft)} disabled={!draft || save.isPending}>
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const holidaySchema = z
  .object({
    name: z.string().trim().min(1, 'Name the holiday').max(80),
    startDate: z.string().min(1, 'Pick the first day'),
    endDate: z.string(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { message: 'The last day must be on or after the first', path: ['endDate'] });
type HolidayValues = z.infer<typeof holidaySchema>;

function dateRange(h: Holiday): string {
  const start = h.startDate.slice(0, 10);
  const end = h.endDate.slice(0, 10);
  if (start === end) return longDate(start);
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  return `${longDate(start)} – ${longDate(end)} · ${days} days`;
}

function HolidaysCard({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<Holiday>();
  const today = new Date().toISOString().slice(0, 10);
  const holidays = useQuery({ queryKey: ['holidays'], queryFn: () => listHolidays({ limit: 100 }) });

  const form = useForm<HolidayValues>({ resolver: zodResolver(holidaySchema), defaultValues: { name: '', startDate: '', endDate: '' } });
  const add = useMutation({
    mutationFn: (v: HolidayValues) => createHoliday({ name: v.name, startDate: v.startDate, endDate: v.endDate || undefined }),
    onSuccess: async (h) => {
      await queryClient.invalidateQueries({ queryKey: ['holidays'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-board'] });
      toast.success(`${h.name} added`);
      form.reset({ name: '', startDate: '', endDate: '' });
    },
    onError: (error) => applyServerError(error, form.setError, ['name', 'startDate', 'endDate'], "Couldn't add the holiday"),
  });
  const remove = useMutation({
    mutationFn: (h: Holiday) => deleteHoliday(h._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['holidays'] });
      await queryClient.invalidateQueries({ queryKey: ['attendance-board'] });
      toast.success(`${removing?.name} removed — those days are school days again`);
      setRemoving(undefined);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't remove the holiday")),
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <h2 className="font-semibold">Holidays</h2>

        {canEdit && (
          <form onSubmit={form.handleSubmit((v) => add.mutateAsync(v))} noValidate className="grid items-start gap-3 sm:grid-cols-[1fr_10rem_10rem_auto]">
            <Field label="Holiday" error={errors.name?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} placeholder="e.g. Eid ul-Fitr" aria-describedby={describedBy} aria-invalid={!!errors.name} {...form.register('name')} />
              )}
            </Field>
            <Field label="From" error={errors.startDate?.message} required>
              {({ id, describedBy }) => <Input id={id} type="date" aria-describedby={describedBy} aria-invalid={!!errors.startDate} {...form.register('startDate')} />}
            </Field>
            <Field label="To" error={errors.endDate?.message} help="Leave empty for one day">
              {({ id, describedBy }) => <Input id={id} type="date" aria-describedby={describedBy} aria-invalid={!!errors.endDate} {...form.register('endDate')} />}
            </Field>
            <Button type="submit" className="sm:mt-6" disabled={isSubmitting}>
              {isSubmitting ? 'Adding…' : 'Add'}
            </Button>
          </form>
        )}

        {holidays.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : holidays.isError ? (
          <ErrorState error={holidays.error} onRetry={() => void holidays.refetch()} />
        ) : (holidays.data?.items ?? []).length === 0 ? (
          <EmptyState icon={CalendarOff} title="No holidays yet" description={canEdit ? 'Add public holidays and breaks as they’re announced.' : undefined} />
        ) : (
          <ul className="rows-stagger divide-y overflow-hidden rounded-lg border">
            {(holidays.data?.items ?? []).map((h) => {
              const past = h.endDate.slice(0, 10) < today;
              return (
                <li key={h._id} className={cn('flex items-center justify-between gap-3 px-4 py-2.5 text-sm', past && 'text-muted-foreground')}>
                  <div className="min-w-0">
                    <p className="font-medium">{h.name}</p>
                    <p className="text-xs">{dateRange(h)}</p>
                  </div>
                  {canEdit && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${h.name}`} onClick={() => setRemoving(h)}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(undefined)}
        title={`Remove ${removing?.name}?`}
        description="Those days become school days again, so their registers are expected — teachers can catch up within their window, the office any time."
        confirmLabel="Remove holiday"
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </Card>
  );
}
