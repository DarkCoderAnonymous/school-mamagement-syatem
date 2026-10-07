import { useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { draftFromStudent, StudentForm, toStudentInput } from '@/components/front-office/student-form';
import { createStudent, type StudentInput } from '@/lib/api/front-office';

/** Admit a student. The admission number is issued by the server when this saves. */
export default function AdmitStudentScreen() {
  const params = useLocalSearchParams<{ classId?: string; sectionId?: string }>();
  const queryClient = useQueryClient();
  const [initial] = useState(() => draftFromStudent(undefined, { classId: params.classId, sectionId: params.sectionId }));

  return (
    <>
      <Stack.Screen options={{ title: 'Admit a student' }} />
      <StudentForm
        initial={initial}
        isEdit={false}
        submitLabel="Admit student"
        submit={(draft) => createStudent(toStudentInput(draft, { isEdit: false, includeGuardians: true }) as StudentInput)}
        onSaved={(student) => {
          queryClient.setQueryData(['students', 'detail', student._id], student);
          void queryClient.invalidateQueries({ queryKey: ['students', 'list'] });
          void queryClient.invalidateQueries({ queryKey: ['front-office', 'class-options'] });
          void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          router.replace({ pathname: '/modules/students/[id]', params: { id: student._id } });
          Alert.alert(`${student.firstName} admitted`, `Admission number ${student.admissionNumber}`);
        }}
      />
    </>
  );
}
