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
import { NativeSelect } from '@/components/form/native-select';
import { useTeacherOptions } from '@/hooks/use-school-options';
import { applyServerError } from '@/lib/form-errors';
import { createClass, createSection, updateClass, updateSection } from '@/lib/api/school';
import type { SchoolClass, Section } from '@/lib/api/types';

const classSchema = z.object({
  name: z.string().trim().min(1, 'Give the class a name').max(60),
  order: z.coerce.number().int().min(0, 'Use 0 or more').max(999),
});
type ClassValues = z.infer<typeof classSchema>;

export function ClassDialog({
  open,
  onOpenChange,
  cls,
  academicSessionId,
  nextOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cls?: SchoolClass;
  academicSessionId?: string;
  nextOrder: number;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(cls);
  const form = useForm<ClassValues>({ resolver: zodResolver(classSchema), defaultValues: { name: '', order: 0 } });

  useEffect(() => {
    if (open) form.reset({ name: cls?.name ?? '', order: cls?.order ?? nextOrder });
  }, [open, cls, nextOrder, form]);

  const mutation = useMutation({
    mutationFn: (values: ClassValues) =>
      isEdit ? updateClass(cls!._id, values) : createClass({ ...values, academicSessionId }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success(isEdit ? 'Class updated' : `${saved.name} created — add its sections next`);
      onOpenChange(false);
    },
    onError: (error) => applyServerError(error, form.setError, ['name', 'order'], "Couldn't save the class"),
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit class' : 'New class'}</DialogTitle>
          <DialogDescription>A grade or year group, such as “Grade 5”. Sections are added inside it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <Field label="Class name" error={errors.name?.message} required>
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} aria-invalid={!!errors.name} autoFocus {...form.register('name')} />
            )}
          </Field>
          <Field
            label="Display order"
            error={errors.order?.message}
            help="Lower numbers are listed first, so Grade 2 comes before Grade 10."
          >
            {({ id, describedBy }) => (
              <Input id={id} type="number" min={0} aria-describedby={describedBy} {...form.register('order')} className="w-32" />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create class'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const sectionSchema = z.object({
  name: z.string().trim().min(1, 'Give the section a name').max(30),
  capacity: z.coerce.number().int().min(1, 'At least 1').max(500),
  room: z.string().trim().max(60),
  classTeacherId: z.string(),
});
type SectionValues = z.infer<typeof sectionSchema>;

export function SectionDialog({
  open,
  onOpenChange,
  cls,
  section,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cls?: SchoolClass;
  section?: Section;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(section);
  const teachers = useTeacherOptions(open);
  const form = useForm<SectionValues>({
    resolver: zodResolver(sectionSchema),
    defaultValues: { name: '', capacity: 40, room: '', classTeacherId: '' },
  });

  useEffect(() => {
    if (!open) return;
    const suggested = String.fromCharCode(65 + (cls?.sections.length ?? 0)); // A, B, C…
    form.reset({
      name: section?.name ?? suggested,
      capacity: section?.capacity ?? 40,
      room: section?.room ?? '',
      classTeacherId: section?.classTeacherId?._id ?? '',
    });
  }, [open, section, cls, form]);

  const mutation = useMutation({
    mutationFn: (values: SectionValues) => {
      const payload = {
        name: values.name,
        capacity: values.capacity,
        room: values.room || undefined,
        classTeacherId: values.classTeacherId || null,
      };
      return isEdit ? updateSection(section!._id, payload) : createSection({ ...payload, classId: cls!._id });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success(isEdit ? 'Section updated' : 'Section added');
      onOpenChange(false);
    },
    onError: (error) =>
      applyServerError(error, form.setError, ['name', 'capacity', 'classTeacherId'], "Couldn't save the section"),
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit section ${section!.name}` : `Add a section to ${cls?.name ?? 'class'}`}</DialogTitle>
          <DialogDescription>A section is one group of students with its own class teacher and room.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Section name" error={errors.name?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} aria-invalid={!!errors.name} autoFocus {...form.register('name')} />
              )}
            </Field>
            <Field label="Capacity" error={errors.capacity?.message} required>
              {({ id, describedBy }) => (
                <Input id={id} type="number" min={1} aria-describedby={describedBy} aria-invalid={!!errors.capacity} {...form.register('capacity')} />
              )}
            </Field>
          </div>
          <Field label="Room" error={errors.room?.message}>
            {({ id, describedBy }) => (
              <Input id={id} placeholder="e.g. Block B, Room 12" aria-describedby={describedBy} {...form.register('room')} />
            )}
          </Field>
          <Field
            label="Class teacher"
            error={errors.classTeacherId?.message}
            help={teachers.data?.length === 0 ? 'Add teachers first to assign one here.' : undefined}
          >
            {({ id, describedBy }) => (
              <NativeSelect id={id} aria-describedby={describedBy} disabled={teachers.isLoading} {...form.register('classTeacherId')}>
                <option value="">{teachers.isLoading ? 'Loading teachers…' : 'Not assigned'}</option>
                {teachers.data?.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add section'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
