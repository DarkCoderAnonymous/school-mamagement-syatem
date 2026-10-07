import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { useTheme } from '@/lib/theme';

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
}

/** A labelled input: the label is always visible, the error sits right under the field. */
export function TextField({ label, error, hint, className = '', onFocus, onBlur, ...props }: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        className={`h-12 rounded-xl border bg-card px-3.5 text-base text-foreground ${error ? 'border-destructive' : focused ? 'border-primary' : 'border-input'} ${className}`}
        placeholderTextColor={theme.mutedForeground}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {error ? <Text className="text-xs text-destructive">{error}</Text> : hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}
