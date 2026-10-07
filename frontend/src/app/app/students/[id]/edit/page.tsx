'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { applyServerError } from '@/lib/form-errors';
import { fullName } from '@/lib/labels';
import { getStudent, updateStudent } from '@/lib/api/school';
import type { Student } from '@/lib/api/types';
import {
  STUDENT_SERVER_FIELDS,
  StudentFormFields,
  defaultsFromStudent,
  toStudentInput,
  useStudentForm,
} from '../../student-form';

export default function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const query = useQuery({ queryKey: ['students', id], queryFn: () => getStudent(id) });

  if (query.isLoading) return <Skeleton className="mx-auto h-96 max-w-3xl rounded-xl" />;
  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          title="Couldn't load this student"
        />
      </div>
    );
  }
  // Keyed so the form's defaults are taken from the loaded record, once.
  return <EditStudentForm key={query.data._id} student={query.data} />;
}

function EditStudentForm({ student }: { student: Student }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useStudentForm(defaultsFromStudent(student));

  const mutation = useMutation({
    mutationFn: async () => {
      const values = form.getValues();
      const { dirtyFields } = form.formState;
      // Guardian links are only re-sent when the user changed them.
      const touchedGuardians = Boolean(dirtyFields.guardians || dirtyFields.primaryIndex);
      return updateStudent(student._id, {
        ...toStudentInput(values, touchedGuardians),
        status: values.status,
      });
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['students'] });
      await queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast.success('Student updated');
      router.push(`/app/students/${saved._id}`);
    },
    onError: (error) =>
      applyServerError(error, form.setError, STUDENT_SERVER_FIELDS, "Couldn't save the student"),
  });

  const submitting = form.formState.isSubmitting;

  return (
    <form
      onSubmit={form.handleSubmit(() => mutation.mutateAsync())}
      noValidate
      className="mx-auto max-w-3xl space-y-6"
    >
      <PageHeader
        title={`Edit ${fullName(student)}`}
        description={`Admission number ${student.admissionNumber}`}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Students', href: '/app/students' },
          { label: fullName(student), href: `/app/students/${student._id}` },
          { label: 'Edit' },
        ]}
      />
      <StudentFormFields form={form} isEdit />
      <div className="bg-background/90 sticky bottom-0 -mx-4 flex justify-end gap-2 border-t px-4 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting || !form.formState.isDirty}>
          {submitting ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
