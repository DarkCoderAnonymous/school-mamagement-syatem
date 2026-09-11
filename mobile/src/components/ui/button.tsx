import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

interface ButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'outline' | 'destructive';
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-blue-600 active:bg-blue-700',
  outline: 'border border-gray-300 bg-white active:bg-gray-50',
  destructive: 'bg-red-600 active:bg-red-700',
};

const VARIANT_TEXT_CLASSES: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'text-white',
  outline: 'text-gray-900',
  destructive: 'text-white',
};

export function Button({ label, loading, variant = 'primary', disabled, className = '', ...props }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      className={`h-12 items-center justify-center rounded-lg ${VARIANT_CLASSES[variant]} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? '#111827' : '#fff'} />
      ) : (
        <Text className={`text-base font-medium ${VARIANT_TEXT_CLASSES[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}
