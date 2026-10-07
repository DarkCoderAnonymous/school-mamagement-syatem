import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View, type FlatListProps } from 'react-native';
import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { Paginated } from '@sms/shared';
import { useTheme } from '@/lib/theme';
import { Icon, type IconName } from './icon';
import { Banner, EmptyState } from './primitives';

/** A search box: magnifier, clear button, no autocorrect (names and admission numbers). */
export function SearchField({ value, onChangeText, placeholder = 'Search' }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  const theme = useTheme();
  return (
    <View className="h-11 flex-row items-center gap-2 rounded-xl border border-border bg-card px-3">
      <Icon name="search" size={18} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
        className="flex-1 text-base text-foreground"
      />
      {value.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChangeText('')}>
          <Icon name="close" size={16} />
        </Pressable>
      )}
    </View>
  );
}

/**
 * One row of a list: optional leading icon/avatar, title, subtitle, trailing
 * content, and a chevron when it opens something. Rows inside one Card are
 * separated by hairlines (`last` drops the final one).
 */
export function ListRow({
  title,
  subtitle,
  leading,
  icon,
  trailing,
  onPress,
  last,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  icon?: IconName;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? title}
      className={`min-h-[56px] flex-row items-center gap-3 px-4 py-3 active:bg-muted ${last ? '' : 'border-b border-border'}`}
    >
      {leading ??
        (icon && (
          <View className="size-9 items-center justify-center rounded-lg bg-primary/10">
            <Icon name={icon} size={18} color="primary" />
          </View>
        ))}
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-medium text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress && <Icon name="chevronRight" size={16} />}
    </Pressable>
  );
}

/** Initials in a tinted circle — people in lists. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <View className="items-center justify-center rounded-full bg-primary/10" style={{ width: size, height: size }}>
      <Text className="font-semibold text-primary" style={{ fontSize: size * 0.36 }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

/** A label/value line on a detail screen. */
export function DetailRow({ label, value, last, onPress, icon }: { label: string; value?: string | null; last?: boolean; onPress?: () => void; icon?: IconName }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={`flex-row items-center justify-between gap-4 px-4 py-3 active:bg-muted ${last ? '' : 'border-b border-border'}`}
    >
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <View className="flex-1 flex-row items-center justify-end gap-1.5">
        <Text className={`text-right text-sm font-medium ${onPress ? 'text-primary' : 'text-foreground'}`} numberOfLines={2}>
          {value || '—'}
        </Text>
        {icon && <Icon name={icon} size={14} color={onPress ? 'primary' : 'mutedForeground'} />}
      </View>
    </Pressable>
  );
}

/** A headline number (the web's KPI tile, phone-sized). */
export function StatTile({ label, value, hint, icon, tone = 'default', onPress }: { label: string; value: string; hint?: string; icon?: IconName; tone?: 'default' | 'success' | 'danger'; onPress?: () => void }) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className="flex-1 gap-2 rounded-2xl border border-border bg-card p-3.5 active:opacity-80"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium text-muted-foreground" numberOfLines={1}>
          {label}
        </Text>
        {icon && <Icon name={icon} size={16} color="primary" />}
      </View>
      <Text
        className={`text-2xl font-semibold tracking-tight ${tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hint ? (
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Single-choice chips (filters, statuses). Scrolls sideways when there are many. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  /** Screen-reader name for the group. */
  label: string;
}) {
  return (
    <FlatList
      horizontal
      data={options}
      keyExtractor={(o) => o.value}
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerClassName="gap-2"
      renderItem={({ item }) => {
        const on = value === item.value;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(on ? undefined : item.value)}
            className={`h-9 justify-center rounded-full border px-3.5 ${on ? 'border-primary bg-primary' : 'border-border bg-card'}`}
          >
            <Text className={`text-sm font-medium ${on ? 'text-primary-foreground' : 'text-foreground'}`}>{item.label}</Text>
          </Pressable>
        );
      }}
    />
  );
}

/**
 * A paged list backed by a `{ items, meta }` endpoint: loads the next page
 * as you near the end, pull to refresh, loading/empty/error states built in.
 * `fetchPage(page)` returns one page; `queryKey` must include every filter.
 */
export function PagedList<T>({
  queryKey,
  fetchPage,
  renderItem,
  keyExtractor,
  header,
  empty,
  enabled = true,
  ...rest
}: {
  queryKey: QueryKey;
  fetchPage: (page: number) => Promise<Paginated<T>>;
  renderItem: (item: T, index: number) => ReactElement;
  keyExtractor: (item: T) => string;
  header?: ReactElement;
  empty: { icon: IconName; title: string; description?: string };
  enabled?: boolean;
} & Pick<FlatListProps<T>, 'contentContainerClassName' | 'ListFooterComponent'>) {
  const theme = useTheme();
  const q = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={keyExtractor}
      renderItem={({ item, index }) => renderItem(item, index)}
      contentContainerClassName={rest.contentContainerClassName ?? 'gap-2 px-4 pb-8 pt-3'}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      onEndReachedThreshold={0.4}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()} tintColor={theme.mutedForeground} colors={[theme.primary]} />}
      ListEmptyComponent={
        q.isLoading ? (
          <ActivityIndicator className="py-10" color={theme.mutedForeground} />
        ) : q.isError ? (
          <Banner tone="danger" title="Couldn't load this list">
            Pull down to try again.
          </Banner>
        ) : (
          <EmptyState icon={empty.icon} title={empty.title} description={empty.description} />
        )
      }
      ListFooterComponent={
        rest.ListFooterComponent ??
        (q.isFetchingNextPage ? <ActivityIndicator className="py-4" color={theme.mutedForeground} /> : q.data && items.length > 0 ? (
          <Text className="py-3 text-center text-xs text-muted-foreground">
            {items.length} of {q.data.pages[0]?.meta.total ?? items.length}
          </Text>
        ) : null)
      }
    />
  );
}
