import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner } from '@/components/ui/primitives';
import { draftFromStudent, StudentForm, toStudentInput } from '@/components/front-office/student-form';
import { useTheme } from '@/lib/theme';
import { ApiRequestError } from '@/lib/api/http';
import { getStudent, updateStudent, type Student } from '@/lib/api/front-office';

/** Edit a student's details, placement, status and guardians. */
export default function EditStudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const query = useQuery({ queryKey: ['students', 'detail', id], queryFn: () => getStudent(id) });

  if (!query.data) {
    return (
      <View className="flex-1 justify-center bg-background px-4">
        <Stack.Screen options={{ title: 'Edit student' }} />
        {query.isError ? (
          <Banner tone="danger" title="Couldn't load this student">
            {query.error instanceof ApiRequestError ? query.error.message : 'Check your connection and try again.'}
          </Banner>
        ) : (
          <ActivityIndicator color={theme.mutedForeground} />
        )}
      </View>
    );
  }
  // Keyed so the form takes its starting values from the loaded record, once.
  return <EditForm key={query.data._id} student={query.data} />;
}

function EditForm({ student }: { student: Student }) {
  const queryClient = useQueryClient();
  const [initial] = useState(() => draftFromStudent(student));

  return (
    <>
      <Stack.Screen options={{ title: `Edit ${student.firstName}` }} />
      <StudentForm
        initial={initial}
        isEdit
        submitLabel="Save changes"
        placementFallback={{ className: student.classId?.name, sectionName: student.sectionId?.name }}
        submit={(draft, guardiansChanged) => updateStudent(student._id, toStudentInput(draft, { isEdit: true, includeGuardians: guardiansChanged }))}
        onSaved={(saved) => {
          queryClient.setQueryData(['students', 'detail', saved._id], saved);
          void queryClient.invalidateQueries({ queryKey: ['students', 'list'] });
          void queryClient.invalidateQueries({ queryKey: ['front-office', 'class-options'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          if (router.canGoBack()) router.back();
          else router.replace({ pathname: '/modules/students/[id]', params: { id: saved._id } });
        }}
      />
    </>
  );
}
