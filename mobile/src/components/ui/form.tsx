import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { Icon } from './icon';
import { SearchField } from './list';

/** Delays a fast-changing value (search text) so each keystroke doesn't hit the API. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** A titled group of fields on a form screen. */
export function FormSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      {title && <Text className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</Text>}
      <View className="gap-3.5">{children}</View>
    </View>
  );
}

/**
 * Pick one option from a list in a bottom sheet — the phone's select box.
 * Searchable once there are more than eight options.
 */
export function OptionPicker<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  error,
  disabled,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string; description?: string }[];
  onChange: (v: T) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const shown = useMemo(
    () => (query ? options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query],
  );

  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected?.label ?? 'not chosen'}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={`h-12 flex-row items-center justify-between rounded-xl border bg-card px-3.5 ${error ? 'border-destructive' : 'border-input'} ${disabled ? 'opacity-50' : ''}`}
      >
        <Text className={`flex-1 text-base ${selected ? 'text-foreground' : 'text-muted-foreground'}`} numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Icon name="chevronRight" size={16} />
      </Pressable>
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)} transparent={false}>
        <SafeAreaView className="flex-1 bg-background" style={{ backgroundColor: theme.background }}>
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <Text className="text-lg font-semibold text-foreground">{label}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => setOpen(false)} className="size-9 items-center justify-center rounded-full bg-muted">
              <Icon name="close" size={16} color="foreground" />
            </Pressable>
          </View>
          {options.length > 8 && (
            <View className="px-4 pt-3">
              <SearchField value={query} onChangeText={setQuery} placeholder={`Search ${label.toLowerCase()}`} />
            </View>
          )}
          <FlatList
            data={shown}
            keyExtractor={(o) => o.value}
            contentContainerClassName="px-4 py-3 gap-1"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = item.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                    setQuery('');
                  }}
                  className={`min-h-[52px] flex-row items-center gap-3 rounded-xl px-3.5 py-2.5 ${on ? 'bg-primary/10' : 'active:bg-muted'}`}
                >
                  <View className="flex-1">
                    <Text className={`text-base ${on ? 'font-semibold text-primary' : 'text-foreground'}`}>{item.label}</Text>
                    {item.description ? <Text className="text-xs text-muted-foreground">{item.description}</Text> : null}
                  </View>
                  {on && <Icon name="check" size={18} color="primary" />}
                </Pressable>
              );
            }}
            ListEmptyComponent={<Text className="py-8 text-center text-sm text-muted-foreground">Nothing matches.</Text>}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/**
 * A calendar day as "YYYY-MM-DD" (no native picker is installed). Shortcuts
 * for today and yesterday cover most entries; the value is validated as typed.
 */
export function DateField({ label, value, onChange, error, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  const theme = useTheme();
  const invalid = value.length > 0 && !isDay(value);
  // Computed once per mount, not on every render.
  const [shortcuts] = useState(() => {
    const now = Date.now();
    return [
      { label: 'Today', v: new Date(now).toISOString().slice(0, 10) },
      { label: 'Yesterday', v: new Date(now - 86_400_000).toISOString().slice(0, 10) },
    ];
  });
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <View className="flex-row gap-2">
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={theme.mutedForeground}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
          accessibilityLabel={label}
          className={`h-12 flex-1 rounded-xl border bg-card px-3.5 text-base text-foreground ${error || invalid ? 'border-destructive' : 'border-input'}`}
        />
        {shortcuts.map((s) => (
          <Pressable key={s.label} onPress={() => onChange(s.v)} className={`h-12 justify-center rounded-xl border px-3 ${value === s.v ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}>
            <Text className={`text-sm font-medium ${value === s.v ? 'text-primary' : 'text-foreground'}`}>{s.label}</Text>
          </Pressable>
        ))}
      </View>
      {error || invalid ? <Text className="text-xs text-destructive">{error ?? 'Use the format YYYY-MM-DD'}</Text> : hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}

/** An amount in major units ("1250.50"), with the currency symbol in front. Parse with `parseMoney`. */
export function MoneyField({ label, value, onChange, error, hint }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <View className={`h-12 flex-row items-center rounded-xl border bg-card px-3.5 ${error ? 'border-destructive' : 'border-input'}`}>
        <Text className="mr-1.5 text-base text-muted-foreground">$</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0.00"
          placeholderTextColor={theme.mutedForeground}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          className="flex-1 text-base text-foreground"
        />
      </View>
      {error ? <Text className="text-xs text-destructive">{error}</Text> : hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
    </View>
  );
}
