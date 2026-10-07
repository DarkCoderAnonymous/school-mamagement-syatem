'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type TableDensity = 'comfortable' | 'compact';

const KEY = 'sms.table-density';
const listeners = new Set<() => void>();
/** Used when storage is blocked (private mode, site data off): the choice lasts for this visit. */
let memory: TableDensity = 'comfortable';

function read(): TableDensity {
  try {
    return localStorage.getItem(KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    return memory;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab changing it moves this one too.
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Row density for every data table (design-system.md: 40px rows by default,
 * 32px compact), remembered in this browser. Rendered as "comfortable" on the
 * server and for the first paint, so hydration never mismatches.
 */
export function useTableDensity(): [TableDensity, (d: TableDensity) => void] {
  const density = useSyncExternalStore(subscribe, read, () => 'comfortable' as const);
  const set = useCallback((d: TableDensity) => {
    memory = d;
    try {
      localStorage.setItem(KEY, d);
    } catch {
      // Not persisted; `memory` carries it for this visit.
    }
    listeners.forEach((l) => l());
  }, []);
  return [density, set];
}
