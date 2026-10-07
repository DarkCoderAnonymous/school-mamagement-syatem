/**
 * Accent palettes a school admin can pick for their school (`School.theme`).
 *
 * The colours themselves live in the web's `frontend/src/app/globals.css`
 * (`[data-palette]` blocks) and mobile generates its copy from there — this
 * list is only the keys, names and a swatch. Each palette was tuned to keep
 * WCAG AA text contrast in light and dark mode and to stay clear of the status
 * colours (red/amber/green/blue badges); add one by adding its CSS block with
 * the same lightness steps, then `npm run theme` in mobile/.
 *
 * `swatch` is the light-mode primary as hex: what the picker shows, and what
 * the school's avatar badge (`School.primaryColor`) is set to.
 */
export const SCHOOL_THEMES = [
  { key: 'blue', name: 'Blue', swatch: '#2368bd' },
  { key: 'indigo', name: 'Indigo', swatch: '#4f52c1' },
  { key: 'violet', name: 'Violet', swatch: '#7444b4' },
  { key: 'plum', name: 'Plum', swatch: '#973787' },
  { key: 'rose', name: 'Rose', swatch: '#ae316e' },
  { key: 'bronze', name: 'Bronze', swatch: '#8c541f' },
  { key: 'teal', name: 'Teal', swatch: '#017272' },
  { key: 'emerald', name: 'Emerald', swatch: '#01614d' },
  { key: 'slate', name: 'Slate', swatch: '#3f4e63' },
] as const;

export type SchoolTheme = (typeof SCHOOL_THEMES)[number]['key'];

export const SCHOOL_THEME_KEYS = SCHOOL_THEMES.map((t) => t.key) as [SchoolTheme, ...SchoolTheme[]];

/** The app's own palette — what every school has until its admin picks another. */
export const DEFAULT_SCHOOL_THEME: SchoolTheme = 'blue';
