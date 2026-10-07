import { PALETTE_TOKENS, THEME_TOKENS, type ThemeTokens } from './theme-tokens';
import { useResolvedScheme } from './theme-mode';
import { useSchoolPalette } from './school-palette';

/**
 * The same tokens as the Tailwind classes, as colour values — for the props
 * NativeWind can't reach (tab bar, icon tints, spinners, placeholder text).
 * Follows the person's light/dark choice (lib/theme-mode) and their school's
 * palette (lib/school-palette), like the classes.
 */
export function useTheme(): ThemeTokens & { scheme: 'light' | 'dark' } {
  const scheme = useResolvedScheme();
  const palette = useSchoolPalette();
  return { ...THEME_TOKENS[scheme], ...PALETTE_TOKENS[palette][scheme], scheme };
}
