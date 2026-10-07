import { Pressable, ScrollView, Text } from 'react-native';
import { Icon, type IconName } from './icon';

/**
 * Switch between views of one thing (a student's profile, fees, attendance…).
 * The tabs share the row evenly and scroll sideways when they don't fit.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { value: T; label: string; icon?: IconName }[];
  value: T;
  onChange: (v: T) => void;
  /** Screen-reader name for the group. */
  label: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={label}
      className="grow-0"
      contentContainerClassName="grow gap-1 rounded-xl bg-muted p-1"
    >
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <Pressable
            key={t.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.label}
            onPress={() => onChange(t.value)}
            className={`h-10 grow flex-row items-center justify-center gap-1.5 rounded-lg px-3 ${on ? 'bg-card' : 'active:bg-card/60'}`}
          >
            {t.icon && <Icon name={t.icon} size={15} color={on ? 'primary' : 'mutedForeground'} />}
            <Text
              className={`text-sm font-semibold ${on ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
