'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { applyServerError } from '@/lib/form-errors';
import { createStudent, type StudentInput } from '@/lib/api/school';
import {
  STUDENT_SERVER_FIELDS,
  StudentFormFields,
  defaultsFromStudent,
  toStudentInput,
  useStudentForm,
} from '../student-form';

function AdmitStudent() {
  const router = useRouter();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const form = useStudentForm(
    defaultsFromStudent(undefined, {
      classId: search.get('classId') ?? undefined,
      sectionId: search.get('sectionId') ?? undefined,
    }),
  );

  const mutation = useMutation({
    mutationFn: (input: StudentInput) => createStudent(input),
    onSuccess: async (student) => {
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success(`${student.firstName} admitted`, { description: `Admission number ${student.admissionNumber}` });
      router.push(`/app/students/${student._id}`);
    },
    onError: (error) => applyServerError(error, form.setError, STUDENT_SERVER_FIELDS, "Couldn't admit the student"),
  });

  const submitting = form.formState.isSubmitting;

  return (
    <form
      onSubmit={form.handleSubmit((v) => mutation.mutateAsync(toStudentInput(v) as StudentInput))}
      noValidate
      className="mx-auto max-w-3xl space-y-6"
    >
      <PageHeader
        title="Admit a student"
        description="The admission number is issued when you save."
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Students', href: '/app/students' },
          { label: 'Admit' },
        ]}
      />
      <StudentFormFields form={form} isEdit={false} />
      <div className="bg-background/90 sticky bottom-0 -mx-4 flex justify-end gap-2 border-t px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Admitting…' : 'Admit student'}
        </Button>
      </div>
    </form>
  );
}

export default function NewStudentPage() {
  return (
    <Suspense fallback={null}>
      <AdmitStudent />
    </Suspense>
  );
}
