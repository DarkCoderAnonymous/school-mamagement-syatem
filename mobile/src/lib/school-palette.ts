import { useSyncExternalStore } from 'react';
import { PALETTE_TOKENS, type PaletteKey } from './theme-tokens';

/**
 * The active school's accent palette (`AuthUser.schoolTheme`, picked by the
 * school admin on the web). Held outside React context so `useTheme()` works
 * anywhere — the session sets it whenever the signed-in user changes, like
 * the money format's currency.
 */
let current: PaletteKey = 'blue';
const listeners = new Set<() => void>();

export function setSchoolPalette(theme: string | null | undefined): void {
  const next: PaletteKey = theme && theme in PALETTE_TOKENS ? (theme as PaletteKey) : 'blue';
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

export function useSchoolPalette(): PaletteKey {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}
