import axios, { isAxiosError, type AxiosError, type AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import type { ApiResponse, RefreshResponse } from '@sms/shared';
import { tokenStorage } from './token-storage';

/**
 * In development on a real phone, `localhost` is the phone itself. Expo Go
 * loaded this app from the dev machine (hostUri, e.g. "10.0.2.59:8081"), so
 * the API is on that same machine at port 4000. An explicit
 * EXPO_PUBLIC_API_BASE_URL / extra.apiBaseUrl always wins.
 */
function devMachineApi(): string | undefined {
  const host = Constants.expoConfig?.hostUri?.split(':')[0];
  return __DEV__ && host ? `http://${host}:4000/api/v1` : undefined;
}

/**
 * A release build only talks to the API over HTTPS — tokens, marks and fee
 * records must never cross the network in cleartext. Throws at startup, so a
 * misconfigured build fails loudly instead of shipping. `allowInsecure`
 * (EXPO_PUBLIC_ALLOW_INSECURE_API=1) is the escape hatch for QA builds against
 * a LAN server; development builds are unaffected.
 */
export function assertSecureApiBaseUrl(url: string, isDev: boolean, allowInsecure: boolean): void {
  if (isDev || allowInsecure) return;
  if (!/^https:\/\//i.test(url.trim())) {
    throw new Error(
      `Refusing to start: the API base URL "${url}" is not HTTPS. Release builds must set ` +
        'EXPO_PUBLIC_API_BASE_URL to an https:// URL (or EXPO_PUBLIC_ALLOW_INSECURE_API=1 for a QA build against a LAN server).',
    );
  }
}

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  devMachineApi() ??
  'http://localhost:4000/api/v1';

assertSecureApiBaseUrl(API_BASE_URL, __DEV__, process.env.EXPO_PUBLIC_ALLOW_INSECURE_API === '1');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

/**
 * How to sign out when a refresh is refused mid-session (session revoked,
 * access removed, school suspended). The session context registers it;
 * without it the tokens are gone but the screens stay up until a restart.
 */
let onUnauthorized: () => void = () => undefined;
export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

// No interceptors, so a failed refresh can't recursively trigger another one.
const refreshClient = axios.create({ baseURL: API_BASE_URL });

apiClient.interceptors.request.use(async (config) => {
  const token = await tokenStorage.getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Whether a failed refresh means the session is really over. Only the server
 * saying so — 401 (revoked, expired, removed) or 403 (school suspended,
 * subscription inactive) — ends it. A network error, timeout or 5xx says
 * nothing about the session, so the tokens are kept for the next attempt.
 */
export function shouldClearSessionOnRefreshError(err: unknown): boolean {
  const status = isAxiosError(err) ? err.response?.status : undefined;
  return status === 401 || status === 403;
}

let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await tokenStorage.getRefreshToken();
  if (!refreshToken) throw new Error('No refresh token stored');

  const res = await refreshClient.post<ApiResponse<RefreshResponse>>('/auth/refresh', { refreshToken });
  if (!res.data.success) throw new Error(res.data.error.message);

  await tokenStorage.setTokens(res.data.data.accessToken, res.data.data.refreshToken);
  return res.data.data.accessToken;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // A 401 before sign-in (a wrong password) has no session to refresh: it
      // stays on its own screen with the server's own error.
      if (!(await tokenStorage.getRefreshToken())) return Promise.reject(error);
      originalRequest._retry = true;
      try {
        // Single flight: concurrent 401s share one refresh. It resolves only
        // after the new pair is persisted, and clears itself when settled so a
        // late waiter can't wipe a newer refresh.
        refreshInFlight ??= refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
        const accessToken = await refreshInFlight;
        originalRequest.headers = originalRequest.headers ?? {};
        (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Offline, timed out or a 5xx: the request fails, the session stays.
        if (shouldClearSessionOnRefreshError(refreshError)) {
          await tokenStorage.clear();
          onUnauthorized();
        }
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
