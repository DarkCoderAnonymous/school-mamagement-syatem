import { View, type ViewProps } from 'react-native';
import { useTheme } from '@/lib/theme';

/**
 * A raised surface: the web's card on a phone. A hairline border plus a
 * soft contact shadow tinted with the ink colour (elevation on Android).
 */
export function Card({ className = '', style, ...props }: ViewProps & { className?: string }) {
  const theme = useTheme();
  return (
    <View
      className={`rounded-2xl border border-border bg-card ${className}`}
      style={[
        theme.scheme === 'light'
          ? { shadowColor: theme.foreground, shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 }
          : null,
        style,
      ]}
      {...props}
    />
  );
}
