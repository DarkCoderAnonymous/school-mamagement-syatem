'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { ApiRequestError } from '@/lib/api/http';
import {
  createAcademicSession,
  updateAcademicSession,
  type AcademicSessionInput,
} from '@/lib/api/academic-sessions';
import type { AcademicSession } from '@/lib/api/types';

/**
 * Mirrors the backend's Zod schema (academic-sessions.validation.ts) so the
 * user gets the same verdict instantly that the server would give — the
 * server still validates, this just saves a round trip.
 */
const formSchema = z
  .object({
    name: z.string().min(1, 'Give this session a name').max(100),
    startDate: z.string().min(1, 'Start date is required'),
    endDate: z.string().min(1, 'End date is required'),
    isCurrent: z.boolean(),
  })
  .refine((data) => new Date(data.endDate) > new Date(data.startDate), {
    message: 'End date must be after the start date',
    path: ['endDate'],
  });

type FormValues = z.infer<typeof formSchema>;

/** <input type="date"> wants yyyy-MM-dd; the API speaks ISO. */
function toDateInput(iso: string | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}

export function SessionFormDialog({
  open,
  onOpenChange,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit, absent = create. */
  session?: AcademicSession;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(session);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', startDate: '', endDate: '', isCurrent: false },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: session?.name ?? '',
      startDate: toDateInput(session?.startDate),
      endDate: toDateInput(session?.endDate),
      isCurrent: session?.isCurrent ?? false,
    });
  }, [open, session, reset]);

  const mutation = useMutation({
    mutationFn: (values: AcademicSessionInput) =>
      isEdit ? updateAcademicSession(session!._id, values) : createAcademicSession(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['academic-sessions'] });
      toast.success(isEdit ? 'Session updated' : 'Session created');
      onOpenChange(false);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError && error.code === 'CONFLICT') {
        // The server owns uniqueness; surface it on the field that caused it.
        setError('name', { message: error.message });
        return;
      }
      toast.error(
        error instanceof ApiRequestError ? error.message : "Couldn't save the session. Try again.",
      );
    },
  });

  const onSubmit = handleSubmit((values) =>
    mutation.mutateAsync({
      name: values.name,
      // Dates are sent as UTC midnight: a session boundary is a calendar day,
      // not a moment, so it must not shift with the browser's timezone.
      startDate: new Date(`${values.startDate}T00:00:00.000Z`).toISOString(),
      endDate: new Date(`${values.endDate}T00:00:00.000Z`).toISOString(),
      isCurrent: values.isCurrent,
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit academic session' : 'New academic session'}</DialogTitle>
          <DialogDescription>
            A session is one school year. Classes, attendance, exams and fees all hang off it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Session name" error={errors.name?.message} required help="For example, 2025-2026.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} {...register('name')} autoFocus />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Start date" error={errors.startDate?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} type="date" aria-describedby={describedBy} {...register('startDate')} />
              )}
            </Field>
            <Field label="End date" error={errors.endDate?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} type="date" aria-describedby={describedBy} {...register('endDate')} />
              )}
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="accent-primary mt-0.5 size-4" {...register('isCurrent')} />
            <span>
              <span className="font-medium">Make this the current session</span>
              <span className="text-muted-foreground block text-xs">
                Only one session can be current. Setting this one demotes the other.
              </span>
            </span>
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create session'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
