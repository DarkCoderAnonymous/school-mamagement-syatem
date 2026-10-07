import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Linking, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { useDebounced } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { ChoiceChips, SearchField } from '@/components/ui/list';
import { Banner, EmptyState } from '@/components/ui/primitives';
import { errorText, FEES_KEY, fullName } from '@/components/fees/fee-ui';
import { listClassOptions, listDefaulters, sendReminders, type Defaulter } from '@/lib/api/fees';
import { useSession } from '@/lib/auth-context';
import { formatDate, formatMoney } from '@/lib/format';
import { can } from '@/lib/modules';
import { useTheme } from '@/lib/theme';

const PAGE_SIZE = 25;

/**
 * Students with fees past their due date, largest overdue first (the API's
 * order). Call a guardian from the row; email reminders to the ones picked,
 * or to everyone overdue.
 */
export default function DefaultersScreen() {
  const theme = useTheme();
  const { user } = useSession();
  const perms = user?.permissions;
  const allowed = can(perms, Permission.FEE_REPORT_READ);
  const canOpenInvoices = can(perms, Permission.FEE_INVOICE_READ);
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search.trim());
  const [classId, setClassId] = useState<string>();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const classes = useQuery({
    queryKey: [FEES_KEY, 'class-options'],
    queryFn: listClassOptions,
    enabled: allowed && can(perms, Permission.CLASS_READ),
    staleTime: 5 * 60_000,
  });

  const q = useInfiniteQuery({
    queryKey: [FEES_KEY, 'defaulters', { search: debounced, classId: classId ?? null }],
    enabled: allowed,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => listDefaulters({ page: pageParam, limit: PAGE_SIZE, search: debounced || undefined, classId }),
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const first = q.data?.pages[0]?.meta;
  const total = first?.total ?? 0;
  const totalOverdue = first?.totalOverdueMinor ?? 0;

  const remind = useMutation({
    mutationFn: (ids?: string[]) => sendReminders(ids),
    onSuccess: (r) => {
      setPicked([]);
      setSelecting(false);
      const skipped = r.skippedNoEmail ? `\n${r.skippedNoEmail} famil${r.skippedNoEmail === 1 ? 'y has' : 'ies have'} no email on file — call them instead.` : '';
      Alert.alert(`${r.sent} reminder${r.sent === 1 ? '' : 's'} sent`, `Primary guardians were emailed their overdue total.${skipped}`);
    },
    onError: (err) => Alert.alert("Couldn't send reminders", errorText(err)),
  });

  const confirmRemind = (ids?: string[]) => {
    if (remind.isPending) return;
    Alert.alert(
      ids ? `Email ${ids.length} famil${ids.length === 1 ? 'y' : 'ies'}?` : `Email every overdue family (${total})?`,
      'Each primary guardian with an email gets a reminder with their overdue total. Families without an email are counted so you can call them.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send reminders', onPress: () => remind.mutate(ids) },
      ],
    );
  };

  const call = async (name: string, phone: string) => {
    const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(`Couldn't call ${name}`, `This device can't place calls. The number is ${phone}.`);
    }
  };

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  if (!allowed) {
    return (
      <View className="flex-1 bg-background px-4 pt-3">
        <Stack.Screen options={{ title: 'Defaulters' }} />
        <Banner tone="warning" icon="lock" title="Not available">
          Your role can’t see fee reports.
        </Banner>
      </View>
    );
  }

  const classOptions = (classes.data?.items ?? []).map((c) => ({ value: c._id, label: c.name }));

  return (
    <SafeAreaView edges={selecting || total > 0 ? ['bottom'] : []} className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: 'Defaulters',
          headerRight:
            total > 0
              ? () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={selecting ? 'Stop selecting' : 'Select families to remind'}
                    hitSlop={10}
                    onPress={() => {
                      setSelecting((s) => !s);
                      setPicked([]);
                    }}
                    className="min-h-[44px] justify-center px-1"
                  >
                    <Text className="text-base font-medium text-primary">{selecting ? 'Done' : 'Select'}</Text>
                  </Pressable>
                )
              : undefined,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(d) => d._id}
        contentContainerClassName="gap-2 px-4 pb-8 pt-3"
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()} tintColor={theme.mutedForeground} colors={[theme.primary]} />
        }
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            {first && total > 0 && (
              <View className="gap-0.5 rounded-2xl bg-destructive-soft p-4">
                <Text className="text-xs font-medium text-destructive">Overdue</Text>
                <Text className="text-2xl font-semibold tracking-tight text-destructive">{formatMoney(totalOverdue)}</Text>
                <Text className="text-xs text-foreground/80">
                  {total} student{total === 1 ? '' : 's'} past the due date{classId || debounced ? ' (filtered)' : ''}
                </Text>
              </View>
            )}
            <SearchField value={search} onChangeText={setSearch} placeholder="Student name or admission no." />
            {classOptions.length > 0 && <ChoiceChips label="Class" options={classOptions} value={classId} onChange={setClassId} />}
          </View>
        }
        ListEmptyComponent={
          q.isLoading ? (
            <ActivityIndicator className="py-10" color={theme.mutedForeground} />
          ) : q.isError ? (
            <Banner tone="danger" title="Couldn't load defaulters">
              {`${errorText(q.error)} Pull down to try again.`}
            </Banner>
          ) : debounced || classId ? (
            <EmptyState icon="search" title="No one matches" description="Nobody overdue fits this search or class." />
          ) : (
            <EmptyState icon="check" title="Nobody is overdue" description="Every invoice past its due date has been paid." />
          )
        }
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <ActivityIndicator className="py-4" color={theme.mutedForeground} />
          ) : items.length > 0 ? (
            <Text className="py-3 text-center text-xs text-muted-foreground">
              {items.length} of {total}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <DefaulterRow
            d={item}
            selecting={selecting}
            checked={picked.includes(item._id)}
            onToggle={() => toggle(item._id)}
            onOpen={canOpenInvoices ? () => router.push({ pathname: '/modules/fees', params: { studentId: item._id } }) : undefined}
            onCall={call}
          />
        )}
      />

      {total > 0 && (
        <View className="border-t border-border bg-card px-4 pb-2 pt-3">
          {selecting ? (
            <Button
              label={picked.length ? `Remind ${picked.length} selected` : 'Tap families to select'}
              icon="send"
              loading={remind.isPending}
              disabled={picked.length === 0}
              onPress={() => confirmRemind(picked)}
            />
          ) : (
            <Button label="Remind everyone" icon="send" variant="outline" loading={remind.isPending} onPress={() => confirmRemind()} />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function DefaulterRow({
  d,
  selecting,
  checked,
  onToggle,
  onOpen,
  onCall,
}: {
  d: Defaulter;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
  onOpen?: () => void;
  onCall: (name: string, phone: string) => void;
}) {
  const name = fullName(d.student);
  const cls = d.student?.classId ? `${d.student.classId.name}${d.student.sectionId ? ` ${d.student.sectionId.name}` : ''}` : null;
  const contact = d.primaryContact;
  const onPress = selecting ? onToggle : onOpen;
  return (
    <View className={`overflow-hidden rounded-2xl border bg-card ${checked ? 'border-primary' : 'border-border'}`}>
      <Pressable
        disabled={!onPress}
        onPress={onPress}
        accessibilityRole={selecting ? 'checkbox' : onPress ? 'button' : undefined}
        accessibilityState={selecting ? { checked } : undefined}
        accessibilityLabel={`${name}, ${formatMoney(d.overdueMinor)} overdue, ${d.daysOverdue} days`}
        className={`flex-row items-center gap-3 p-3.5 ${checked ? 'bg-primary/10' : 'active:bg-muted'}`}
      >
        {selecting && (
          <View className={`size-6 items-center justify-center rounded-md border ${checked ? 'border-primary bg-primary' : 'border-input bg-card'}`}>
            {checked && <Text className="text-sm font-bold text-primary-foreground">✓</Text>}
          </View>
        )}
        <View className="flex-1 gap-0.5">
          <Text className="text-base font-medium text-foreground" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {d.student?.admissionNumber ?? '—'}
            {cls ? ` · ${cls}` : ''}
          </Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            Since {formatDate(d.oldestDueDate)} · {d.daysOverdue} day{d.daysOverdue === 1 ? '' : 's'} · {d.invoiceCount} invoice{d.invoiceCount === 1 ? '' : 's'}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className="text-base font-semibold text-destructive">{formatMoney(d.overdueMinor)}</Text>
          {!selecting && onOpen && <Icon name="chevronRight" size={16} />}
        </View>
      </Pressable>
      {contact && (
        <View className="flex-row items-center gap-3 border-t border-border px-3.5 py-1.5">
          <View className="flex-1">
            <Text className="text-xs text-foreground" numberOfLines={1}>
              {fullName(contact)}
            </Text>
            <Text className="text-xs text-muted-foreground" numberOfLines={1}>
              {contact.phone || 'No phone'}
              {contact.email ? '' : ' · no email'}
            </Text>
          </View>
          {contact.phone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${fullName(contact)}, ${contact.phone}`}
              onPress={() => onCall(fullName(contact), contact.phone)}
              className="h-11 flex-row items-center gap-1.5 rounded-xl bg-primary/10 px-3 active:opacity-80"
            >
              <Icon name="phone" size={16} color="primary" />
              <Text className="text-sm font-semibold text-primary">Call</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}
