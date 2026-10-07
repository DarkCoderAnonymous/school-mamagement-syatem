import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTheme } from '@/lib/theme';
import type { ThemeTokens } from '@/lib/theme-tokens';

/**
 * The app's icons, named once: SF Symbols on iOS, Material Symbols on
 * Android and web — each platform's own icon language, same meaning. The
 * names are type-checked against expo-symbols, so a typo fails the build.
 */
const ICONS = {
  home: { ios: 'house', android: 'home' },
  attendance: { ios: 'checklist', android: 'fact_check' },
  profile: { ios: 'person.crop.circle', android: 'account_circle' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left' },
  calendarOff: { ios: 'calendar.badge.minus', android: 'event_busy' },
  history: { ios: 'clock.arrow.circlepath', android: 'history' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  checkAll: { ios: 'checkmark.circle', android: 'done_all' },
  school: { ios: 'building.columns', android: 'account_balance' },
  students: { ios: 'person.2', android: 'group' },
  book: { ios: 'book', android: 'menu_book' },
  note: { ios: 'square.and.pencil', android: 'edit_note' },
  lock: { ios: 'lock', android: 'lock' },
  key: { ios: 'key', android: 'key' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
  info: { ios: 'info.circle', android: 'info' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  swap: { ios: 'arrow.left.arrow.right', android: 'swap_horiz' },
  star: { ios: 'star.fill', android: 'star' },
  more: { ios: 'square.grid.2x2', android: 'apps' },
  dashboard: { ios: 'chart.pie', android: 'dashboard' },
  marks: { ios: 'list.number', android: 'format_list_numbered' },
  payslip: { ios: 'doc.text', android: 'receipt_long' },
  calendar: { ios: 'calendar', android: 'calendar_month' },
  student: { ios: 'graduationcap', android: 'face' },
  staff: { ios: 'person.3', android: 'groups' },
  staffAttendance: { ios: 'person.badge.clock', android: 'badge' },
  fees: { ios: 'banknote', android: 'payments' },
  receipt: { ios: 'receipt', android: 'receipt' },
  alert: { ios: 'exclamationmark.circle', android: 'error' },
  exams: { ios: 'calendar.badge.checkmark', android: 'event_available' },
  results: { ios: 'rosette', android: 'military_tech' },
  inventory: { ios: 'shippingbox', android: 'inventory_2' },
  finance: { ios: 'chart.bar', android: 'bar_chart' },
  search: { ios: 'magnifyingglass', android: 'search' },
  plus: { ios: 'plus', android: 'add' },
  minus: { ios: 'minus', android: 'remove' },
  phone: { ios: 'phone', android: 'call' },
  mail: { ios: 'envelope', android: 'mail' },
  filter: { ios: 'line.3.horizontal.decrease', android: 'filter_list' },
  close: { ios: 'xmark', android: 'close' },
  send: { ios: 'paperplane', android: 'send' },
  trendUp: { ios: 'arrow.up.right', android: 'north_east' },
  trendDown: { ios: 'arrow.down.right', android: 'south_east' },
  eye: { ios: 'eye', android: 'visibility' },
  trash: { ios: 'trash', android: 'delete' },
  sun: { ios: 'sun.max', android: 'light_mode' },
  moon: { ios: 'moon', android: 'dark_mode' },
  device: { ios: 'iphone', android: 'smartphone' },
} as const satisfies Record<string, Extract<SymbolViewProps['name'], { ios?: unknown }>>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  color = 'mutedForeground',
}: {
  name: IconName;
  size?: number;
  /** A theme token name, so icons follow light/dark with the rest of the UI. */
  color?: keyof ThemeTokens;
}) {
  const theme = useTheme();
  return (
    <SymbolView
      // Web renders Material Symbols, like Android.
      name={{ ...ICONS[name], web: ICONS[name].android }}
      size={size}
      tintColor={theme[color]}
      type="monochrome"
      style={{ width: size, height: size }}
    />
  );
}
