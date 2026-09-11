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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        refreshInFlight ??= refreshAccessToken();
        const accessToken = await refreshInFlight;
        refreshInFlight = null;
        originalRequest.headers = originalRequest.headers ?? {};
        (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        refreshInFlight = null;
        onUnauthorized();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
