import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { Icon, type IconName } from './icon';

type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const PILL: Record<Tone, { box: string; text: string }> = {
  neutral: { box: 'bg-muted', text: 'text-muted-foreground' },
  primary: { box: 'bg-primary/10', text: 'text-primary' },
  success: { box: 'bg-success-soft', text: 'text-success' },
  warning: { box: 'bg-warning-soft', text: 'text-warning-ink' },
  danger: { box: 'bg-destructive-soft', text: 'text-destructive' },
  info: { box: 'bg-info-soft', text: 'text-info' },
};

/** A small status label. Always words, so state never rests on colour alone. */
export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return (
    <View className={`rounded-md px-2 py-0.5 ${PILL[tone].box}`}>
      <Text className={`text-xs font-semibold ${PILL[tone].text}`}>{label}</Text>
    </View>
  );
}

const METER: Record<'primary' | 'warning' | 'danger', { track: string; fill: string }> = {
  primary: { track: 'bg-chart-1/15', fill: 'bg-chart-1' },
  warning: { track: 'bg-warning-soft', fill: 'bg-warning' },
  danger: { track: 'bg-destructive-soft', fill: 'bg-destructive' },
};

/** A ratio against its whole; the track is a lighter step of the fill's colour. */
export function Meter({ value, tone = 'primary', label }: { value: number; tone?: keyof typeof METER; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      className={`h-2 w-full overflow-hidden rounded-full ${METER[tone].track}`}
    >
      <View className={`h-full rounded-full ${METER[tone].fill}`} style={{ width: `${pct}%` }} />
    </View>
  );
}

const BANNER: Record<'info' | 'warning' | 'danger' | 'success', { box: string; icon: IconName; color: 'info' | 'warningInk' | 'destructive' | 'success' }> = {
  info: { box: 'bg-info-soft', icon: 'info', color: 'info' },
  warning: { box: 'bg-warning-soft', icon: 'warning', color: 'warningInk' },
  danger: { box: 'bg-destructive-soft', icon: 'warning', color: 'destructive' },
  success: { box: 'bg-success-soft', icon: 'check', color: 'success' },
};

/** An inline message with an icon — never colour alone. */
export function Banner({ tone = 'info', icon, title, children }: { tone?: keyof typeof BANNER; icon?: IconName; title?: string; children?: ReactNode }) {
  const b = BANNER[tone];
  return (
    <View className={`flex-row gap-3 rounded-xl p-3.5 ${b.box}`}>
      <Icon name={icon ?? b.icon} size={18} color={b.color} />
      <View className="flex-1 gap-0.5">
        {title && <Text className="text-sm font-semibold text-foreground">{title}</Text>}
        {typeof children === 'string' ? <Text className="text-sm text-foreground/80">{children}</Text> : children}
      </View>
    </View>
  );
}

/** A section heading inside a screen. */
export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View className="flex-row items-center justify-between px-1">
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</Text>
      {action}
    </View>
  );
}

export function EmptyState({ icon, title, description }: { icon: IconName; title: string; description?: string }) {
  return (
    <View className="items-center gap-2 px-6 py-10">
      <View className="mb-1 size-12 items-center justify-center rounded-2xl bg-muted">
        <Icon name={icon} size={24} />
      </View>
      <Text className="text-center text-base font-semibold text-foreground">{title}</Text>
      {description && <Text className="max-w-xs text-center text-sm text-muted-foreground">{description}</Text>}
    </View>
  );
}
