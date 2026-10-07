import { useMemo, useState } from 'react';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { DateField, FormSection, MoneyField, OptionPicker } from '@/components/ui/form';
import { ChoiceChips } from '@/components/ui/list';
import { Banner } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/text-field';
import { ApiRequestError } from '@/lib/api/http';
import {
  getInventoryItem,
  listInventoryItems,
  MOVEMENT_LABEL,
  MOVEMENT_TYPES,
  quantityLabel,
  recordMovement,
  unitLabel,
  type InventoryItem,
  type MovementType,
} from '@/lib/api/management';
import { parseMoney } from '@/lib/format';

const todayUtc = () => new Date().toISOString().slice(0, 10);
const TYPE_OPTIONS = MOVEMENT_TYPES.map((value) => ({ value, label: MOVEMENT_LABEL[value].verb }));
const toMajor = (minor: number) => (minor / 100).toFixed(2);

type Errors = Partial<Record<'item' | 'quantity' | 'party' | 'unitCost' | 'note' | 'date', string>>;

/**
 * Record one stock movement, as the web's movement dialog does. The ledger is
 * append-only: a mistake is corrected with another movement (usually ADJUST).
 * The server refuses anything that would take stock below zero.
 */
export default function RecordMovementScreen() {
  const { itemId: initialItemId } = useLocalSearchParams<{ itemId?: string }>();
  const queryClient = useQueryClient();
  const [itemId, setItemId] = useState<string | undefined>(initialItemId);
  const [type, setType] = useState<MovementType>('ISSUE');
  const [direction, setDirection] = useState<'add' | 'remove'>('remove');
  const [quantity, setQuantity] = useState('');
  const [party, setParty] = useState('');
  const [reference, setReference] = useState('');
  const [unitCost, setUnitCost] = useState<string>();
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayUtc);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const items = useQuery({
    queryKey: ['inventory', 'items', 'options'],
    queryFn: () => listInventoryItems({ limit: 100, sort: 'name' }),
    staleTime: 60_000,
  });
  // The preselected item may sit past the first 100; fetch it on its own.
  const preselected = useQuery({
    queryKey: ['inventory', 'item', initialItemId],
    queryFn: () => getInventoryItem(initialItemId!),
    enabled: !!initialItemId,
  });

  const allItems = useMemo(() => {
    const list = items.data?.items ?? [];
    const extra = preselected.data;
    return extra && !list.some((i) => i._id === extra._id) ? [extra, ...list] : list;
  }, [items.data, preselected.data]);
  const item: InventoryItem | undefined = allItems.find((i) => i._id === itemId);
  const options = allItems.map((i) => ({
    value: i._id,
    label: i.name,
    description: `${i.sku} · ${quantityLabel(i.quantityOnHand, i.unit)} in stock`,
  }));

  // Unit cost starts at the item's current cost until the user edits it.
  const costText = unitCost ?? (item ? toMajor(item.unitCostMinor) : '');

  const qty = /^\d+$/.test(quantity.trim()) ? Number(quantity.trim()) : NaN;
  const sign =
    type === 'RECEIVE' || type === 'RETURN'
      ? 1
      : type === 'ADJUST'
        ? direction === 'add'
          ? 1
          : -1
        : -1;
  const change = Number.isFinite(qty) ? sign * qty : 0;
  const after = item ? item.quantityOnHand + change : 0;
  const partyRequired = type === 'ISSUE' || type === 'RETURN';
  const showParty = partyRequired || type === 'RECEIVE';

  const errors: Errors = {};
  if (!item) errors.item = 'Pick an item';
  if (!Number.isFinite(qty) || qty <= 0) errors.quantity = 'Enter a whole number above zero';
  else if (qty > 1_000_000) errors.quantity = 'That is more than the maximum of 1,000,000';
  if (partyRequired && !party.trim())
    errors.party = type === 'ISSUE' ? 'Who is it going to?' : 'Who is returning it?';
  if (type === 'RECEIVE' && costText.trim() && parseMoney(costText) === null)
    errors.unitCost = 'Enter an amount like 12.50';
  if (type === 'ADJUST' && !note.trim())
    errors.note = 'Say why the count changed (e.g. "annual stock count")';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = 'Use the format YYYY-MM-DD';
  else if (date > todayUtc()) errors.date = 'The date cannot be in the future';
  const valid = Object.keys(errors).length === 0;
  const shown = (k: keyof Errors) => (submitted ? errors[k] : undefined);

  const save = useMutation({
    mutationFn: () =>
      recordMovement(item!._id, {
        type,
        quantity: type === 'ADJUST' ? change : qty,
        unitCostMinor:
          type === 'RECEIVE' && costText.trim() ? (parseMoney(costText) ?? undefined) : undefined,
        party: showParty ? party.trim() || undefined : undefined,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        // Today means "now"; a back-dated entry is pinned to that day's start, like the web.
        occurredAt:
          date !== todayUtc() ? new Date(`${date}T00:00:00.000Z`).toISOString() : undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      router.back();
    },
    onError: (err) =>
      setServerError(
        err instanceof ApiRequestError ? err.message : 'Check your connection and try again.',
      ),
  });

  const submit = () => {
    setSubmitted(true);
    setServerError(undefined);
    if (valid) save.mutate();
  };

  const meta = MOVEMENT_LABEL[type];
  const unitMany = item ? unitLabel(item.unit) : 'units';

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Record movement' }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="gap-6 px-4 pb-8 pt-3"
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          <FormSection>
            <OptionPicker
              label="Item"
              value={itemId}
              options={options}
              onChange={(v) => {
                setItemId(v);
                setUnitCost(undefined);
              }}
              placeholder={items.isLoading ? 'Loading items…' : 'Choose an item'}
              error={shown('item')}
              disabled={items.isLoading && !preselected.data}
            />
            {items.isError && (
              <Banner tone="danger">
                Couldn&apos;t load the item list. Go back and try again.
              </Banner>
            )}
          </FormSection>

          <FormSection title="What happened">
            <ChoiceChips
              label="Movement type"
              options={TYPE_OPTIONS}
              value={type}
              onChange={(v) => v && setType(v)}
            />
            <Text className="px-1 text-sm text-muted-foreground">{meta.description}</Text>
            {type === 'ADJUST' && (
              <ChoiceChips
                label="Adjustment direction"
                options={[
                  { value: 'add' as const, label: '+ More than recorded' },
                  { value: 'remove' as const, label: '− Fewer than recorded' },
                ]}
                value={direction}
                onChange={(v) => v && setDirection(v)}
              />
            )}
            <TextField
              label={type === 'ADJUST' ? `Difference (${unitMany})` : `Quantity (${unitMany})`}
              value={quantity}
              onChangeText={(t) => setQuantity(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="0"
              maxLength={7}
              error={shown('quantity')}
            />
            {item && (
              <View
                accessibilityLiveRegion="polite"
                className={`flex-row items-center justify-between rounded-xl px-3.5 py-2.5 ${after < 0 ? 'bg-destructive-soft' : 'bg-muted'}`}
              >
                <Text className="text-sm text-muted-foreground">In stock</Text>
                <Text className={`text-sm ${after < 0 ? 'text-destructive' : 'text-foreground'}`}>
                  {item.quantityOnHand} →{' '}
                  <Text className="font-semibold">{change ? after : '…'}</Text>
                  {after < 0 ? ' — not enough stock' : ''}
                </Text>
              </View>
            )}
            <DateField label="Date" value={date} onChange={setDate} error={shown('date')} />
          </FormSection>

          <FormSection title="Details">
            {showParty && (
              <TextField
                label={
                  type === 'ISSUE'
                    ? 'Issued to'
                    : type === 'RETURN'
                      ? 'Returned by'
                      : 'Supplier / from (optional)'
                }
                value={party}
                onChangeText={setParty}
                maxLength={120}
                placeholder={
                  type === 'RECEIVE'
                    ? 'e.g. City Stationers'
                    : 'A class, department or person — e.g. Grade 7-B'
                }
                error={shown('party')}
              />
            )}
            {type === 'RECEIVE' && (
              <MoneyField
                label="Unit cost"
                value={costText}
                onChange={setUnitCost}
                error={shown('unitCost')}
                hint="Updates the item's current cost."
              />
            )}
            <TextField
              label="Reference (optional)"
              value={reference}
              onChangeText={setReference}
              maxLength={60}
              autoCapitalize="characters"
              hint="Invoice, delivery note or requisition number."
            />
            <TextField
              label={type === 'ADJUST' ? 'Note' : 'Note (optional)'}
              value={note}
              onChangeText={setNote}
              maxLength={300}
              multiline
              className="h-24 py-3"
              textAlignVertical="top"
              error={shown('note')}
            />
          </FormSection>

          {serverError && (
            <Banner tone="danger" title="Couldn't record that">
              {serverError}
            </Banner>
          )}

          <Button
            label={item ? `${meta.verb} · ${item.name}` : meta.verb}
            variant={type === 'WRITE_OFF' ? 'destructive' : 'primary'}
            loading={save.isPending}
            onPress={submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
