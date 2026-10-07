import { Stack } from 'expo-router';
import { useTheme } from '@/lib/theme';

/**
 * Every staff module lives in this one stack under the More tab; screens set
 * their own titles with <Stack.Screen options={{ title }} />.
 */
export default function ModulesStack() {
  const theme = useTheme();
  return (
    <Stack
      screenOptions={{
        headerTintColor: theme.primary,
        headerStyle: { backgroundColor: theme.background },
        headerTitleStyle: { color: theme.foreground },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'More', headerLargeTitle: true }} />
    </Stack>
  );
}
