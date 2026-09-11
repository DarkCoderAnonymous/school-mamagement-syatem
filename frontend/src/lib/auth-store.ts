import { create } from 'zustand';
import type { AuthUser } from '@sms/shared';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  setSession: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  setStatus: (status: AuthState['status']) => void;
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
  setSession: (user, accessToken) => set({ user, accessToken, status: 'authenticated' }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setStatus: (status) => set({ status }),
  clear: () => set({ user: null, accessToken: null, status: 'unauthenticated' }),
}));
