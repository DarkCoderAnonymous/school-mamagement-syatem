import { Pressable, Text, View } from 'react-native';
import type { ThemeTokens } from '@/lib/theme-tokens';
import { Icon, type IconName } from './icon';

export type TileTone = 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<TileTone, { box: string; icon: keyof ThemeTokens }> = {
  primary: { box: 'bg-primary/10', icon: 'primary' },
  info: { box: 'bg-info-soft', icon: 'info' },
  success: { box: 'bg-success-soft', icon: 'success' },
  warning: { box: 'bg-warning-soft', icon: 'warningInk' },
  danger: { box: 'bg-destructive-soft', icon: 'destructive' },
  neutral: { box: 'bg-muted', icon: 'foreground' },
};

/**
 * A tappable icon + label — quick actions and the module grid. The tone
 * tints the icon's chip by area (fees green, people blue…) so a screen of
 * tiles scans by colour as well as by word.
 */
export function Tile({
  label,
  description,
  icon,
  tone = 'primary',
  onPress,
  compact,
}: {
  label: string;
  description?: string;
  icon: IconName;
  tone?: TileTone;
  onPress: () => void;
  /** Icon over a short label (quick actions); otherwise a roomier card with a description. */
  compact?: boolean;
}) {
  const t = TONE[tone];
  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        className="w-full items-center gap-1.5 rounded-2xl border border-border bg-card px-1.5 py-3 active:bg-muted"
      >
        <View className={`size-10 items-center justify-center rounded-xl ${t.box}`}>
          <Icon name={icon} size={20} color={t.icon} />
        </View>
        <Text className="text-center text-xs font-medium text-foreground" numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={description ? `${label}. ${description}` : label}
      onPress={onPress}
      className="min-h-[112px] w-full gap-2.5 rounded-2xl border border-border bg-card p-3.5 active:bg-muted"
    >
      <View className={`size-10 items-center justify-center rounded-xl ${t.box}`}>
        <Icon name={icon} size={20} color={t.icon} />
      </View>
      <View className="gap-0.5">
        <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
          {label}
        </Text>
        {description ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Lays tiles out `columns` to a row, wrapping; the last row keeps the same widths. */
export function TileGrid({ columns, children }: { columns: number; children: React.ReactNode[] }) {
  const width = `${100 / columns}%` as const;
  return (
    <View className="-m-1 flex-row flex-wrap">
      {children.map((child, i) => (
        <View key={i} className="p-1" style={{ width }}>
          {child}
        </View>
      ))}
    </View>
  );
}
