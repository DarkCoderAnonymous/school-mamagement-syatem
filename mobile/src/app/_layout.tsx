import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Role } from '@sms/shared';
import { QueryProvider } from '@/components/providers/query-provider';
import { SessionProvider, useSession } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

const MOBILE_ROLES: Role[] = [Role.PARENT, Role.STUDENT, Role.TEACHER];

function SplashScreenController() {
  const { status } = useSession();

  useEffect(() => {
    if (status !== 'loading') SplashScreen.hide();
  }, [status]);

  return null;
}

function RootNavigator() {
  const { user, status } = useSession();
  const isMobileRole = user ? user.roles.some((r) => MOBILE_ROLES.includes(r as Role)) : false;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signed-out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'signed-in' && !!user?.mustChangePassword}>
        <Stack.Screen name="change-password" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'signed-in' && !user?.mustChangePassword && isMobileRole}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected guard={status === 'signed-in' && !user?.mustChangePassword && !isMobileRole}>
        <Stack.Screen name="web-only" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <SessionProvider>
          <SplashScreenController />
          <RootNavigator />
          <StatusBar style="auto" />
        </SessionProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
