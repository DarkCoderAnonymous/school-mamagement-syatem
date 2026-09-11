/**
 * Standard error shape returned on every failed API call.
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Standard envelope every backend endpoint responds with.
 *
 * Success: { success: true, data }
 * Failure: { success: false, error }
 */
export type ApiResponse<T> =
  | {
      success: true;
      data: T;
      error?: undefined;
    }
  | {
      success: false;
      data?: undefined;
      error: ApiError;
    };

/**
 * Standard pagination envelope for list endpoints.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Common query shape accepted by every list endpoint.
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
  filters?: Record<string, unknown>;
}
