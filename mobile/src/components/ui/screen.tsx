import { useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';

/**
 * A scrolling screen on the app canvas. `onRefresh` adds pull-to-refresh —
 * the phone's way of saying "show me the latest".
 */
export function Screen({
  children,
  onRefresh,
  edges = ['top'],
  footer,
}: {
  children: ReactNode;
  onRefresh?: () => Promise<unknown>;
  edges?: Edge[];
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
      <ScrollView
        contentContainerClassName="gap-5 px-4 pb-8 pt-3"
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              tintColor={theme.mutedForeground}
              colors={[theme.primary]}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
      {footer && <View>{footer}</View>}
    </SafeAreaView>
  );
}
