import { apiGet, apiGetPaginated, apiPatch } from './http';
import type { School, SchoolStatus } from './types';

export function listSchools(params: { page?: number; limit?: number; search?: string; status?: string }) {
  return apiGetPaginated<School>('/admin/schools', params);
}

export function getSchool(id: string): Promise<School> {
  return apiGet(`/admin/schools/${id}`);
}

export function updateSchoolStatus(id: string, status: SchoolStatus): Promise<School> {
  return apiPatch(`/admin/schools/${id}/status`, { status });
}
