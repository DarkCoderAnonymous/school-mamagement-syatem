import { cssInterop } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * NativeWind styles React Native's own components; third-party ones must be
 * registered, or their `className` is silently dropped. SafeAreaView wraps
 * most screens and every bottom sheet, so it's mapped here once, at startup.
 */
cssInterop(SafeAreaView, { className: 'style' });
