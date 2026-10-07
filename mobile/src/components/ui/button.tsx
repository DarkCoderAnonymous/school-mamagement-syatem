import { ActivityIndicator, Pressable, Text, View, type PressableProps } from 'react-native';
import { useTheme } from '@/lib/theme';
import { Icon, type IconName } from './icon';

type Variant = 'primary' | 'outline' | 'ghost' | 'destructive';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  loading?: boolean;
  variant?: Variant;
  size?: 'md' | 'sm';
  icon?: IconName;
  className?: string;
}

const VARIANT: Record<Variant, { box: string; text: string }> = {
  primary: { box: 'bg-primary', text: 'text-primary-foreground' },
  outline: { box: 'border border-border bg-card', text: 'text-foreground' },
  ghost: { box: 'bg-transparent', text: 'text-foreground' },
  destructive: { box: 'border border-destructive/30 bg-destructive-soft', text: 'text-destructive' },
};

/** Presses dip slightly (scale 0.98) — acknowledgement, not bounce. Touch target ≥ 44pt at every size. */
export function Button({ label, loading, variant = 'primary', size = 'md', icon, disabled, className = '', style, ...props }: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;
  const v = VARIANT[variant];
  const iconColor = variant === 'primary' ? 'primaryForeground' : variant === 'destructive' ? 'destructive' : 'foreground';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      className={`flex-row items-center justify-center gap-2 rounded-xl ${size === 'md' ? 'h-12 px-5' : 'h-11 px-4'} ${v.box} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      style={(state) => [{ transform: [{ scale: state.pressed ? 0.98 : 1 }], opacity: state.pressed ? 0.9 : undefined }, typeof style === 'function' ? style(state) : style]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? theme.primaryForeground : theme.foreground} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon && <Icon name={icon} size={18} color={iconColor} />}
          <Text className={`${size === 'md' ? 'text-base' : 'text-sm'} font-semibold ${v.text}`}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}
