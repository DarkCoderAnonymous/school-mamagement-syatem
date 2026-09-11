'use client';

import { useEffect, type ReactNode } from 'react';
import { configureApiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { me, refresh } from '@/lib/api/auth';

configureApiClient({
  getAccessToken: () => useAuthStore.getState().accessToken,
  onUnauthorized: () => useAuthStore.getState().clear(),
  onTokenRefreshed: (accessToken) => useAuthStore.getState().setAccessToken(accessToken),
});

/**
 * Bootstraps the session once on app load: exchanges the httpOnly refresh
 * cookie for an access token, then loads the current user. If there's no
 * valid session (first visit, expired cookie), settles into
 * 'unauthenticated' rather than erroring — that's the expected logged-out
 * state, not a failure.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    useAuthStore.getState().setStatus('loading');

    (async () => {
      try {
        const { accessToken } = await refresh();
        if (cancelled) return;
        useAuthStore.getState().setAccessToken(accessToken);
        const user = await me();
        if (cancelled) return;
        useAuthStore.getState().setSession(user, accessToken);
      } catch {
        if (!cancelled) useAuthStore.getState().clear();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return <>{children}</>;
}
