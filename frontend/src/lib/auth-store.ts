import { create } from 'zustand';
import type { AuthUser, MembershipSummary } from '@sms/shared';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  /**
   * Set between password verification and school choice (ADR-001). It is not
   * a session: it proves only that the password was just accepted, and it is
   * cleared as soon as a school is chosen or the user leaves the picker.
   */
  pendingSelection: { selectionToken: string; memberships: MembershipSummary[] } | null;
  setSession: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setStatus: (status: AuthState['status']) => void;
  setPendingSelection: (pending: AuthState['pendingSelection']) => void;
  clear: () => void;
}

/**
 * Access token lives in memory only (never localStorage/sessionStorage) so
 * it can't be read by an XSS payload that persists across reloads; the
 * refresh token is an httpOnly cookie the browser holds instead (see
 * api-client.ts's refresh flow). Losing the access token on a hard reload
 * is expected — AuthProvider re-derives it via POST /auth/refresh on boot.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  status: 'idle',
  pendingSelection: null,
  setSession: (user, accessToken) =>
    set({ user, accessToken, status: 'authenticated', pendingSelection: null }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setStatus: (status) => set({ status }),
  setPendingSelection: (pendingSelection) => set({ pendingSelection }),
  clear: () =>
    set({ user: null, accessToken: null, status: 'unauthenticated', pendingSelection: null }),
}));
