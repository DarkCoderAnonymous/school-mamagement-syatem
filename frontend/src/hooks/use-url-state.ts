'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Keeps list state (search, filters, sort, page, active tab) in the URL so a
 * view can be bookmarked, shared with a colleague, and survive a reload —
 * hard rule 5 in the UI spec.
 *
 * Writes use `replace` with `scroll: false`: paging a table shouldn't stack
 * history entries that the back button then has to walk through, nor jump the
 * viewport back to the top.
 */
export interface UrlState {
  get: (key: string) => string | undefined;
  getNumber: (key: string, fallback: number) => number;
  set: (updates: Record<string, string | number | undefined | null>) => void;
  reset: (keep?: string[]) => void;
  params: URLSearchParams;
}

export function useUrlState(): UrlState {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const params = useMemo(() => new URLSearchParams(searchParams.toString()), [searchParams]);

  const set = useCallback(
    (updates: Record<string, string | number | undefined | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === null || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      // Any filter change invalidates the current page number — staying on
      // page 4 of a freshly filtered list usually lands on an empty view.
      if (!('page' in updates) && Object.keys(updates).some((k) => k !== 'page')) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const reset = useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const key of keep) {
        const value = searchParams.get(key);
        if (value) next.set(key, value);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return {
    params,
    get: (key) => searchParams.get(key) ?? undefined,
    getNumber: (key, fallback) => {
      const raw = searchParams.get(key);
      const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(n) && n > 0 ? n : fallback;
    },
    set,
    reset,
  };
}
