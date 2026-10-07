import * as SecureStore from 'expo-secure-store';

export type ThemeMode = 'system' | 'light' | 'dark';
const KEY = 'sms_theme_mode';

/** The person's light/dark choice on this device. Not a secret — secure-store is simply the store the app already has. */
export const themeStorage = {
  async get(): Promise<ThemeMode> {
    const v = await SecureStore.getItemAsync(KEY).catch(() => null);
    return v === 'light' || v === 'dark' ? v : 'system';
  },
  async set(mode: ThemeMode): Promise<void> {
    await (
      mode === 'system' ? SecureStore.deleteItemAsync(KEY) : SecureStore.setItemAsync(KEY, mode)
    ).catch(() => undefined);
  },
};
