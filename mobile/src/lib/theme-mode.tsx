import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import { colorScheme } from 'nativewind';
import { THEME_TOKENS } from './theme-tokens';
import { themeStorage, type ThemeMode } from './theme-storage';

export type { ThemeMode };
export type ResolvedScheme = 'light' | 'dark';

interface ThemeModeValue {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** False until the saved choice has been read — the splash screen waits for it, so the app never flashes the wrong theme. */
  ready: boolean;
}

const ThemeModeContext = createContext<ThemeModeValue>({
  mode: 'system',
  setMode: () => {},
  ready: true,
});

/** backgroundColor → --background, cardForeground → --card-foreground, chart1 → --chart-1 (the names in global.css). */
const cssVar = (token: string) =>
  `--${token
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1-$2')}`;
/** "#2368bd" → "35 104 189", the form global.css stores so opacity modifiers (bg-primary/10) keep working. */
const rgbTriplet = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ');

/**
 * Point the app at a scheme. Native: NativeWind's `colorScheme.set` overrides
 * `Appearance`, so the generated `prefers-color-scheme` tokens, the status
 * bar, native tabs and every Modal follow. Web preview: the browser's media
 * query can't be overridden, so the tokens are set inline on <html>, which
 * beats the stylesheet's :root rules; "system" removes them again.
 */
function apply(mode: ThemeMode) {
  if (Platform.OS !== 'web') {
    colorScheme.set(mode);
    return;
  }
  if (typeof document === 'undefined') return;
  const style = document.documentElement.style;
  for (const token of Object.keys(THEME_TOKENS.light) as (keyof typeof THEME_TOKENS.light)[]) {
    if (mode === 'system') style.removeProperty(cssVar(token));
    else style.setProperty(cssVar(token), rgbTriplet(THEME_TOKENS[mode][token]));
  }
  style.colorScheme = mode === 'system' ? '' : mode;
}

/** Light, dark, or the phone's setting — the web's theme toggle, on the phone. Remembered per device. */
export function ThemeModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void themeStorage.get().then((saved) => {
      if (!alive) return;
      setModeState(saved);
      apply(saved);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    apply(next);
    void themeStorage.set(next);
  }, []);

  const value = useMemo(() => ({ mode, setMode, ready }), [mode, setMode, ready]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export const useThemeMode = () => useContext(ThemeModeContext);

/** The scheme actually showing: the person's choice, or the device's when they left it on System. */
export function useResolvedScheme(): ResolvedScheme {
  const { mode } = useThemeMode();
  const device = useColorScheme();
  if (mode !== 'system') return mode;
  return device === 'dark' ? 'dark' : 'light';
}
