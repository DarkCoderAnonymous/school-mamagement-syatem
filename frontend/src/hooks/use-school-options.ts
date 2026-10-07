'use client';

import { useQuery } from '@tanstack/react-query';
import { listClasses, listInventoryCategories, listSubjects, listTeachers } from '@/lib/api/school';
import { fullName } from '@/lib/labels';

/**
 * Option lists for form dropdowns. Each is one cached request shared by every
 * form that needs it; the lists are small per school (classes, subjects,
 * teachers), so 100 covers them without a paginated picker.
 */
const OPTION_LIMIT = { limit: 100 };
const STALE = 60_000;

export function useClassOptions(enabled = true) {
  return useQuery({
    queryKey: ['classes', 'options'],
    queryFn: () => listClasses(OPTION_LIMIT),
    staleTime: STALE,
    enabled,
    select: (data) => data.items,
  });
}

export function useSubjectOptions(enabled = true) {
  return useQuery({
    queryKey: ['subjects', 'options'],
    queryFn: () => listSubjects(OPTION_LIMIT),
    staleTime: STALE,
    enabled,
    select: (data) => data.items,
  });
}

export function useTeacherOptions(enabled = true) {
  return useQuery({
    queryKey: ['teachers', 'options'],
    queryFn: () => listTeachers({ ...OPTION_LIMIT, status: 'ACTIVE' }),
    staleTime: STALE,
    enabled,
    select: (data) => data.items.map((t) => ({ value: t._id, label: fullName(t.employee) })),
  });
}

export function useInventoryCategoryOptions(enabled = true) {
  return useQuery({
    queryKey: ['inventory-categories', 'options'],
    queryFn: () => listInventoryCategories(OPTION_LIMIT),
    staleTime: STALE,
    enabled,
    select: (data) => data.items,
  });
}
