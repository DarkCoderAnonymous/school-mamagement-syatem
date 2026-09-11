import axios from 'axios';
import type { ApiResponse, Paginated } from '@sms/shared';
import { apiClient } from '../api-client';

/** Normalized error every API call can throw — callers switch on `.code` for specific UX. */
export class ApiRequestError extends Error {
  code: string;
  status?: number;
  details?: unknown;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeError(err: unknown): ApiRequestError {
  if (err instanceof ApiRequestError) return err;
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiResponse<unknown> | undefined;
    if (body && body.success === false) {
      return new ApiRequestError(body.error.code, body.error.message, err.response?.status, body.error.details);
    }
    return new ApiRequestError('NETWORK_ERROR', 'Could not reach the server — check your connection', err.response?.status);
  }
  return new ApiRequestError('UNKNOWN_ERROR', 'Something went wrong');
}

function unwrap<T>(data: ApiResponse<T>): T {
  if (!data.success) throw new ApiRequestError(data.error.code, data.error.message, undefined, data.error.details);
  return data.data;
}

export async function apiGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const res = await apiClient.get<ApiResponse<T>>(url, { params });
    return unwrap(res.data);
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function apiGetPaginated<T>(url: string, params?: Record<string, unknown>): Promise<Paginated<T>> {
  return apiGet<Paginated<T>>(url, params);
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await apiClient.post<ApiResponse<T>>(url, body);
    return unwrap(res.data);
  } catch (err) {
    throw normalizeError(err);
  }
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  try {
    const res = await apiClient.patch<ApiResponse<T>>(url, body);
    return unwrap(res.data);
  } catch (err) {
    throw normalizeError(err);
  }
}
