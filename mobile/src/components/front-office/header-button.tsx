import { Pressable, Text } from 'react-native';
import { Icon, type IconName } from '@/components/ui/icon';

/** A labelled action in the navigation bar ("Admit", "Edit") — text as well as icon, 44pt tall. */
export function HeaderButton({ label, icon, onPress, accessibilityLabel }: { label: string; icon?: IconName; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={8}
      onPress={onPress}
      className="h-11 flex-row items-center gap-1 px-1 active:opacity-60"
    >
      {icon && <Icon name={icon} size={18} color="primary" />}
      <Text className="text-base font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}
