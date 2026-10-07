'use client';

import { useEffect } from 'react';
import { DEFAULT_SCHOOL_THEME } from '@sms/shared';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Puts a palette on <html> (`data-palette`, see globals.css). On <html> rather
 * than a wrapper so dialogs, menus and toasts — portalled to <body> — get it
 * too. The default palette is the base tokens, so it clears the attribute.
 */
export function setDocumentPalette(theme: string | null | undefined): void {
  const root = document.documentElement;
  if (theme && theme !== DEFAULT_SCHOOL_THEME) root.dataset.palette = theme;
  else delete root.dataset.palette;
}

/**
 * The school console in its school's colours. Mounted by the /app layout
 * only, so public pages and the platform console keep the app's own blue;
 * leaving the school app (sign-out) takes the palette off again.
 */
export function SchoolPalette(): null {
  const theme = useAuthStore((s) => s.user?.schoolTheme);
  useEffect(() => {
    setDocumentPalette(theme);
    return () => setDocumentPalette(null);
  }, [theme]);
  return null;
}
