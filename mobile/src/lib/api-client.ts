import axios, { type AxiosError, type AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import type { ApiResponse, RefreshResponse } from '@sms/shared';
import { tokenStorage } from './token-storage';

const API_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://localhost:4000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

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
        await tokenStorage.clear();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);
