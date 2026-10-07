'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
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
import { NativeSelect } from '@/components/form/native-select';
import { useSubjectOptions } from '@/hooks/use-school-options';
import { applyServerError } from '@/lib/form-errors';
import { cn } from '@/lib/utils';
import { createTeacher, updateTeacher } from '@/lib/api/school';
import type { EmployeeStatus, TeacherDetail } from '@/lib/api/types';

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(60),
  lastName: z.string().trim().min(1, 'Last name is required').max(60),
  email: z.string().trim().email('Enter a valid email address'),
  phone: z.string().trim().max(30),
  designation: z.string().trim().min(1, 'Designation is required').max(80),
  department: z.string().trim().max(80),
  joiningDate: z.string().min(1, 'Joining date is required'),
  qualification: z.string().trim().max(120),
  specialization: z.string().trim().max(120),
  experienceYears: z.coerce.number().int().min(0, 'Use 0 or more').max(60),
  subjectIds: z.array(z.string()),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'TERMINATED']),
});
type Values = z.infer<typeof schema>;

const today = () => new Date().toISOString().slice(0, 10);

export function TeacherFormDialog({
  open,
  onOpenChange,
  teacher,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teacher?: TeacherDetail;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = Boolean(teacher);
  const subjects = useSubjectOptions(open);
  const form = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    const e = teacher?.employee;
    form.reset({
      firstName: e?.firstName ?? '',
      lastName: e?.lastName ?? '',
      email: e?.email ?? teacher?.account?.email ?? '',
      phone: e?.phone ?? '',
      designation: e?.designation ?? 'Teacher',
      department: e?.department ?? '',
      joiningDate: e?.joiningDate?.slice(0, 10) ?? today(),
      qualification: teacher?.qualification ?? '',
      specialization: teacher?.specialization ?? '',
      experienceYears: teacher?.experienceYears ?? 0,
      subjectIds: teacher?.subjectIds.map(String) ?? [],
      status: e?.status ?? 'ACTIVE',
    });
  }, [open, teacher, form]);

  const mutation = useMutation({
    mutationFn: (v: Values) => {
      const common = {
        firstName: v.firstName,
        lastName: v.lastName,
        phone: v.phone || undefined,
        designation: v.designation,
        department: v.department || undefined,
        joiningDate: new Date(`${v.joiningDate}T00:00:00.000Z`).toISOString(),
        qualification: v.qualification || undefined,
        specialization: v.specialization || undefined,
        experienceYears: v.experienceYears,
        subjectIds: v.subjectIds,
      };
      return isEdit
        ? updateTeacher(teacher!._id, { ...common, status: v.status as EmployeeStatus })
        : createTeacher({ ...common, email: v.email });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['teachers'] });
      onOpenChange(false);
      if (isEdit) {
        toast.success('Teacher updated');
      } else {
        toast.success(`${saved.employee.firstName} added`, {
          description: saved.account?.pendingFirstSignIn
            ? `A temporary password was emailed to ${saved.account.email}.`
            : 'They already had an account, so they can sign in with it and pick your school.',
        });
        router.push(`/app/teachers/${saved._id}`);
      }
    },
    onError: (error) =>
      applyServerError(error, form.setError, ['email', 'subjectIds', 'firstName', 'lastName'], "Couldn't save the teacher"),
  });

  const { errors, isSubmitting } = form.formState;
  const selected = useWatch({ control: form.control, name: 'subjectIds' }) ?? [];
  const status = useWatch({ control: form.control, name: 'status' });

  const toggleSubject = (id: string) =>
    form.setValue('subjectIds', selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id], {
      shouldDirty: true,
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit teacher' : 'Add a teacher'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Changes apply to this school only.'
              : 'They get a sign-in with a temporary password by email, and are asked to set their own on first sign-in.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-6">
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold">Personal details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" error={errors.firstName?.message} required>
                {({ id, describedBy }) => (
                  <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!errors.firstName} {...form.register('firstName')} />
                )}
              </Field>
              <Field label="Last name" error={errors.lastName?.message} required>
                {({ id, describedBy }) => (
                  <Input id={id} autoComplete="off" aria-describedby={describedBy} aria-invalid={!!errors.lastName} {...form.register('lastName')} />
                )}
              </Field>
              <Field
                label="Email"
                error={errors.email?.message}
                required={!isEdit}
                help={isEdit ? 'Their sign-in email belongs to them and can’t be changed here.' : 'Used to sign in.'}
              >
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    type="email"
                    autoComplete="off"
                    disabled={isEdit}
                    aria-describedby={describedBy}
                    aria-invalid={!!errors.email}
                    {...form.register('email')}
                  />
                )}
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                {({ id, describedBy }) => <Input id={id} type="tel" aria-describedby={describedBy} {...form.register('phone')} />}
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-4 border-t pt-5">
            <legend className="sr-only">Employment</legend>
            <p className="text-sm font-semibold" aria-hidden="true">
              Employment
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Designation" error={errors.designation?.message} required>
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...form.register('designation')} />}
              </Field>
              <Field label="Department" error={errors.department?.message}>
                {({ id, describedBy }) => (
                  <Input id={id} placeholder="e.g. Science" aria-describedby={describedBy} {...form.register('department')} />
                )}
              </Field>
              <Field label="Joining date" error={errors.joiningDate?.message} required>
                {({ id, describedBy }) => <Input id={id} type="date" aria-describedby={describedBy} {...form.register('joiningDate')} />}
              </Field>
            </div>
            {isEdit && (
              <Field
                label="Status"
                help={
                  status === 'TERMINATED'
                    ? 'Their access to this school ends immediately when you save.'
                    : 'On leave keeps their access; terminated ends it.'
                }
              >
                {({ id, describedBy }) => (
                  <NativeSelect id={id} aria-describedby={describedBy} className="sm:w-56" {...form.register('status')}>
                    <option value="ACTIVE">Active</option>
                    <option value="ON_LEAVE">On leave</option>
                    <option value="TERMINATED">Terminated</option>
                  </NativeSelect>
                )}
              </Field>
            )}
          </fieldset>

          <fieldset className="space-y-4 border-t pt-5">
            <legend className="sr-only">Teaching</legend>
            <p className="text-sm font-semibold" aria-hidden="true">
              Teaching
            </p>
            <div className="grid gap-4 sm:grid-cols-[1fr_1fr_8rem]">
              <Field label="Qualification" error={errors.qualification?.message}>
                {({ id, describedBy }) => (
                  <Input id={id} placeholder="e.g. MSc Physics" aria-describedby={describedBy} {...form.register('qualification')} />
                )}
              </Field>
              <Field label="Specialization" error={errors.specialization?.message}>
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...form.register('specialization')} />}
              </Field>
              <Field label="Experience (years)" error={errors.experienceYears?.message}>
                {({ id, describedBy }) => (
                  <Input id={id} type="number" min={0} aria-describedby={describedBy} {...form.register('experienceYears')} />
                )}
              </Field>
            </div>

            <div className="space-y-2" role="group" aria-labelledby="subjects-label">
              <p id="subjects-label" className="text-[0.8125rem] font-medium">
                Subjects taught
              </p>
              {subjects.isLoading && <p className="text-muted-foreground text-xs">Loading subjects…</p>}
              {subjects.data?.length === 0 && (
                <p className="text-muted-foreground text-xs">No subjects yet — add them on the Subjects page, then assign them here.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {subjects.data?.map((s) => {
                  const on = selected.includes(s._id);
                  return (
                    <button
                      key={s._id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleSubject(s._id)}
                      className={cn(
                        'focus-visible:ring-ring/50 rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-3',
                        on ? 'border-primary bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground',
                      )}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
              {errors.subjectIds && <p className="text-destructive text-xs">{errors.subjectIds.message}</p>}
            </div>
          </fieldset>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add teacher'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
