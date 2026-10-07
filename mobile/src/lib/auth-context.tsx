import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthUser, MembershipSummary } from '@sms/shared';
import { tokenStorage } from './token-storage';
import { setOnUnauthorized } from './api-client';
import { setSchoolCurrency } from './format';
import { setSchoolPalette } from './school-palette';
import * as authApi from './api/auth';
import { ApiRequestError } from './api/http';

type SessionStatus = 'loading' | 'signed-in' | 'signed-out';

interface PendingSelection {
  selectionToken: string;
  memberships: MembershipSummary[];
}

interface SessionContextValue {
  user: AuthUser | null;
  status: SessionStatus;
  /**
   * Set between password verification and school choice (ADR-001). Not a
   * session — it only proves the password was just accepted, and it expires
   * in five minutes.
   */
  pendingSelection: PendingSelection | null;
  setPendingSelection: (pending: PendingSelection | null) => void;
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
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const queryClient = useQueryClient();

  // Money and the accent colour follow the active school; set them before the
  // user lands in state so the first render already uses them.
  const applyUser = useCallback((next: AuthUser | null) => {
    setSchoolCurrency(next?.schoolCurrency);
    setSchoolPalette(next?.schoolTheme);
    setUser(next);
  }, []);

  // A refresh refused mid-session (revoked, removed, school suspended) lands
  // the person back on sign-in, where logging in again says why.
  useEffect(
    () =>
      setOnUnauthorized(() => {
        queryClient.clear();
        applyUser(null);
        setPendingSelection(null);
        setStatus('signed-out');
      }),
    [queryClient, applyUser],
  );

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
        applyUser(me);
        setStatus('signed-in');
      } catch (err) {
        if (cancelled) return;
        // Only the server refusing the session (401/403) ends it. Offline, a
        // timeout or a 5xx lands on sign-in with the tokens kept, so the next
        // launch restores the session instead of forcing a new sign-in.
        if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
          await tokenStorage.clear();
        }
        setStatus('signed-out');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyUser]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user,
      status,
      pendingSelection,
      setPendingSelection,
      async signIn(nextUser, accessToken, refreshToken) {
        // A new session — possibly another school or person — starts with an
        // empty cache, so nothing from the previous one can show.
        queryClient.clear();
        await tokenStorage.setTokens(accessToken, refreshToken);
        applyUser(nextUser);
        setPendingSelection(null);
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
        queryClient.clear();
        applyUser(null);
        setPendingSelection(null);
        setStatus('signed-out');
      },
      async refreshUser() {
        const me = await authApi.me();
        applyUser(me);
      },
    }),
    [user, status, pendingSelection, queryClient, applyUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
