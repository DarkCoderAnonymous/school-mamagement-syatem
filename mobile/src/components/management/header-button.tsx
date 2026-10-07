import { Pressable, Text } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icon';

/** A text + icon action for a stack header's right side (≥ 44pt tall). */
export function HeaderButton({ label, icon = 'plus', onPress, accessibilityLabel }: { label: string; icon?: IconName; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={6}
      className="h-11 flex-row items-center gap-1 px-1 active:opacity-60"
    >
      <Icon name={icon} size={18} color="primary" />
      <Text className="text-base font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}
