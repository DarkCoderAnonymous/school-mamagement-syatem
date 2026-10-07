import '../global.css';
import '@/lib/nativewind-interop';

import { useEffect, useMemo, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryProvider } from '@/components/providers/query-provider';
import { SessionProvider, useSession } from '@/lib/auth-context';
import { ThemeModeProvider, useResolvedScheme, useThemeMode } from '@/lib/theme-mode';
import { useSchoolPalette } from '@/lib/school-palette';
import { PALETTE_VARS } from '@/lib/theme-tokens';

SplashScreen.preventAutoHideAsync();

function SplashScreenController() {
  const { status } = useSession();
  const { ready } = useThemeMode();

  useEffect(() => {
    if (status !== 'loading' && ready) SplashScreen.hide();
  }, [status, ready]);

  return null;
}

function RootNavigator() {
  const { user, status } = useSession();
  // Anyone acting through a school membership uses the app; each module is
  // gated by permission, like the web sidebar. Only a platform account (no
  // school) is sent to the web.
  const belongsToSchool = !!user?.schoolId;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === 'signed-out'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>

      <Stack.Protected
        guard={status === 'signed-in' && !user?.mustChangePassword && belongsToSchool}
      >
        <Stack.Screen name="(app)" />
      </Stack.Protected>

      <Stack.Protected
        guard={status === 'signed-in' && !user?.mustChangePassword && !belongsToSchool}
      >
        <Stack.Screen name="web-only" />
      </Stack.Protected>

      {/*
       * Reachable from Profile by anyone signed in; listed after (app) and
       * web-only so a normal launch opens those, while a forced change (both
       * guarded out) lands here first.
       */}
      <Stack.Protected guard={status === 'signed-in'}>
        <Stack.Screen name="change-password" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * Puts the school's accent palette over the generated tokens for every screen
 * below — the phone's twin of the web's `data-palette` on <html>.
 *
 * Variables are set from the FIRST render, Blue included. On native,
 * NativeWind turns a component that gains variables later into a variable
 * provider — a different component type — which remounts everything under
 * it: here the whole navigator, mid sign-in, which crashed the app when
 * someone picked a school with a non-default palette. Always-on variables
 * keep the type fixed; a palette change only updates their values.
 */
function SchoolPaletteRoot({ children }: { children: ReactNode }) {
  const palette = useSchoolPalette();
  const scheme = useResolvedScheme();
  const style = useMemo(() => vars(PALETTE_VARS[palette][scheme]), [palette, scheme]);
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeModeProvider>
        <QueryProvider>
          <SessionProvider>
            <SplashScreenController />
            <SchoolPaletteRoot>
              <RootNavigator />
            </SchoolPaletteRoot>
            <StatusBar style="auto" />
          </SessionProvider>
        </QueryProvider>
      </ThemeModeProvider>
    </SafeAreaProvider>
  );
}
