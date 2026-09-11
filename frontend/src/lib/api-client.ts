import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { RefreshResponse } from '@sms/shared';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Separate instance with no interceptors, used only for the refresh call
// itself so a failed refresh can't recursively trigger another refresh.
const refreshClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true });

let getAccessToken: () => string | null | undefined = () => null;
let onUnauthorized: () => void = () => undefined;
let onTokenRefreshed: (accessToken: string) => void = () => undefined;

/** Called once by AuthProvider to wire in real token storage. */
export function configureApiClient(options: {
  getAccessToken: () => string | null | undefined;
  onUnauthorized?: () => void;
  onTokenRefreshed?: (accessToken: string) => void;
}): void {
  getAccessToken = options.getAccessToken;
  if (options.onUnauthorized) onUnauthorized = options.onUnauthorized;
  if (options.onTokenRefreshed) onTokenRefreshed = options.onTokenRefreshed;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const res = await refreshClient.post<{ success: true; data: RefreshResponse }>('/auth/refresh');
  const { accessToken } = res.data.data;
  onTokenRefreshed(accessToken);
  return accessToken;
}

/**
 * Endpoints whose own 401 is the real answer, not an expired-access-token
 * signal. Retrying these via /auth/refresh is pointless (the caller has no
 * session yet, by definition) and actively harmful: the refresh fails with
 * its own error, which then replaces the meaningful one — a wrong password
 * surfaced as "Missing refresh token" instead of "Incorrect email or
 * password".
 */
const NO_REFRESH_RETRY_PATHS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function isRefreshExempt(url: string | undefined): boolean {
  if (!url) return false;
  // config.url is the path as passed to the client (baseURL is applied
  // later), but tolerate an absolute URL too.
  return NO_REFRESH_RETRY_PATHS.some((path) => url === path || url.endsWith(path));
}

/**
 * Also the recovery path for ADR-005's freshness checks:
 *
 *   TOKEN_STALE     — permissions changed. The refresh below mints a token
 *                     with the new set and the original request is retried,
 *                     so the user sees nothing at all.
 *   SESSION_REVOKED — the session was deliberately ended. The refresh fails
 *                     too (by design), `onUnauthorized` fires, and the user
 *                     is signed out. That difference is the whole reason the
 *                     two codes are distinct.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (
      error.response?.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !isRefreshExempt(originalRequest.url)
    ) {
      originalRequest._retry = true;
      try {
        refreshInFlight ??= refreshAccessToken();
        const accessToken = await refreshInFlight;
        refreshInFlight = null;
        originalRequest.headers = originalRequest.headers ?? {};
        (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch {
        refreshInFlight = null;
        onUnauthorized();
        // Reject with the ORIGINAL error, not the refresh failure: the
        // caller asked about `originalRequest`, so that response is what
        // its error handling is written against.
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);
