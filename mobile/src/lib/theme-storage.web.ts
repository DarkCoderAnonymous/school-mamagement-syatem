/**
 * Web build only (development previews). A theme choice isn't sensitive, so
 * unlike tokens it may live in localStorage — which can throw when site data
 * is blocked, hence the guards.
 */
export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'sms_theme_mode';

export const themeStorage = {
  async get(): Promise<ThemeMode> {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  },
  async set(mode: ThemeMode): Promise<void> {
    try {
      if (mode === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      // Storage blocked — the choice lasts for this visit only.
    }
  },
};
