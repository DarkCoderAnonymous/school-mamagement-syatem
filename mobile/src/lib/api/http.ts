import axios, { type AxiosResponse } from 'axios';
import type { ApiResponse, Paginated } from '@sms/shared';
import { apiClient } from '../api-client';

/** Normalized error every API call can throw — screens switch on `.code` for specific UX. */
export class ApiRequestError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

function normalizeError(err: unknown): ApiRequestError {
  if (err instanceof ApiRequestError) return err;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiResponse<unknown> | undefined;
    if (body && body.success === false) {
      return new ApiRequestError(body.error.code, body.error.message, err.response?.status);
    }
    return new ApiRequestError('NETWORK_ERROR', 'Could not reach the server — check your connection', err.response?.status);
  }
  return new ApiRequestError('UNKNOWN_ERROR', 'Something went wrong');
}

function unwrap<T>(res: AxiosResponse<ApiResponse<T>>): T {
  // 204 No Content (change-password, logout) has no envelope to unwrap.
  if (res.status === 204) return undefined as T;
  const data = res.data;
  if (!data.success) throw new ApiRequestError(data.error.code, data.error.message);
  return data.data;
}

export async function apiGet<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  try {
    const res = await apiClient.get<ApiResponse<T>>(url, { params });
    return unwrap(res);
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await apiClient.post<ApiResponse<T>>(url, body);
    return unwrap(res);
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function apiPut<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await apiClient.put<ApiResponse<T>>(url, body);
    return unwrap(res);
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await apiClient.patch<ApiResponse<T>>(url, body);
    return unwrap(res);
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function apiDelete(url: string): Promise<void> {
  try {
    await apiClient.delete(url);
  } catch (err) {
    throw normalizeError(err);
  }
}

/** A list endpoint: `{ items, meta: { page, limit, total, totalPages } }`. */
export function apiGetPaginated<T>(url: string, params?: Record<string, string | number | undefined>): Promise<Paginated<T>> {
  return apiGet<Paginated<T>>(url, params);
}
