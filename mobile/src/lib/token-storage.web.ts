/**
 * Web build only (react-native-web, used for development previews — the
 * product on the web is the Next.js app). expo-secure-store has no web
 * backend, and tokens must never go to localStorage where any script can
 * read them, so they live in memory: a reload simply signs you out, exactly
 * like the Next.js app's access token.
 */
let access: string | null = null;
let refresh: string | null = null;

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return access;
  },
  async getRefreshToken(): Promise<string | null> {
    return refresh;
  },
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    access = accessToken;
    refresh = refreshToken;
  },
  async clear(): Promise<void> {
    access = null;
    refresh = null;
  },
};
