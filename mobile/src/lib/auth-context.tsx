import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AuthUser } from '@sms/shared';
import { tokenStorage } from './token-storage';
import * as authApi from './api/auth';

type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

interface SessionContextValue {
  user: AuthUser | null;
  status: SessionStatus;
  signIn: (user: AuthUser, accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Session bootstrap on app launch: if a refresh token is stored from a
 * previous run, validate it via GET /auth/me (the api-client's response
 * interceptor transparently exchanges an expired access token for a new one
 * using that refresh token — see api-client.ts). No stored token at all
 * means a genuine first launch / logged-out state, not an error.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const refreshToken = await tokenStorage.getRefreshToken();
      if (!refreshToken) {
        if (!cancelled) setStatus('signed-out');
        return;
      }
      try {
        const me = await authApi.me();
        if (cancelled) return;
        setUser(me);
        setStatus('signed-in');
      } catch {
        if (!cancelled) {
          await tokenStorage.clear();
          setStatus('signed-out');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      status,
      async signIn(nextUser, accessToken, refreshToken) {
        await tokenStorage.setTokens(accessToken, refreshToken);
        setUser(nextUser);
        setStatus('signed-in');
      },
      async signOut() {
        const refreshToken = await tokenStorage.getRefreshToken();
        try {
          await authApi.logout(refreshToken);
        } catch {
          // best-effort — still clear local state even if the request fails
        }
        await tokenStorage.clear();
        setUser(null);
        setStatus('signed-out');
      },
      async refreshUser() {
        const me = await authApi.me();
        setUser(me);
      },
    }),
    [user, status],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
