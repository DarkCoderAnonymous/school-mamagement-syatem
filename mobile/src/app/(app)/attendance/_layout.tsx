import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

/** Attendance: the day's sections, then a section's register pushed on top. Native headers in the app's colours. */
export default function AttendanceStack() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: theme.primary,
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.foreground },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Attendance', headerLargeTitle: true }} />
      <Stack.Screen name="[sectionId]" options={{ title: 'Register' }} />
    </Stack>
  );
}
