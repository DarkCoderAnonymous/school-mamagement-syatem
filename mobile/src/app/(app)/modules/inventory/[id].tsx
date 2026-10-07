import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DetailRow, StatTile } from '@/components/ui/list';
import { Banner, EmptyState, Pill, SectionTitle } from '@/components/ui/primitives';
import { Screen } from '@/components/ui/screen';
import { useSession } from '@/lib/auth-context';
import { ApiRequestError } from '@/lib/api/http';
import {
  fullName,
  getInventoryItem,
  listItemMovements,
  MOVEMENT_LABEL,
  quantityLabel,
  stockLevel,
  unitLabel,
  type InventoryMovement,
} from '@/lib/api/management';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { can } from '@/lib/modules';

const RECENT = 25;

/** One stock item: what's on hand, what it's worth, and its latest movements. */
export default function InventoryItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const canRecord = can(user?.permissions, Permission.INVENTORY_STOCK_RECORD);
  const item = useQuery({
    queryKey: ['inventory', 'item', id],
    queryFn: () => getInventoryItem(id),
  });
  const movements = useQuery({
    queryKey: ['inventory', 'movements', id],
    queryFn: () => listItemMovements(id, { limit: RECENT }),
  });
  const it = item.data;

  if (item.isError) {
    return (
      <Screen edges={[]} onRefresh={() => item.refetch()}>
        <Stack.Screen options={{ title: 'Item' }} />
        <Banner tone="danger" title="Couldn't load this item">
          {item.error instanceof ApiRequestError ? item.error.message : 'Pull down to try again.'}
        </Banner>
      </Screen>
    );
  }

  const level = it ? stockLevel(it) : 'ok';
  const list = movements.data?.items ?? [];
  const total = movements.data?.meta.total ?? 0;

  return (
    <Screen edges={[]} onRefresh={() => Promise.all([item.refetch(), movements.refetch()])}>
      <Stack.Screen options={{ title: it?.name ?? 'Item' }} />

      {!it ? (
        <Card className="h-40 opacity-60" />
      ) : (
        <>
          <View className="gap-1">
            <View className="flex-row items-center gap-2">
              <Text className="flex-1 text-xl font-semibold text-foreground">{it.name}</Text>
              {level === 'out' ? (
                <Pill label="Out of stock" tone="danger" />
              ) : level === 'low' ? (
                <Pill label="Low stock" tone="warning" />
              ) : (
                <Pill label="In stock" tone="success" />
              )}
            </View>
            <Text className="text-sm text-muted-foreground">
              {it.sku}
              {it.categoryId ? ` · ${it.categoryId.name}` : ''}
            </Text>
          </View>

          <View className="flex-row gap-2.5">
            <StatTile
              label="On hand"
              value={formatNumber(it.quantityOnHand)}
              hint={unitLabel(it.unit, it.quantityOnHand !== 1)}
              icon="inventory"
              tone={level === 'out' ? 'danger' : 'default'}
            />
            <StatTile
              label="Stock value"
              value={formatMoney(it.quantityOnHand * it.unitCostMinor)}
              hint={`${formatMoney(it.unitCostMinor)} each`}
              icon="finance"
            />
          </View>

          {level !== 'ok' && (
            <Banner
              tone={level === 'out' ? 'danger' : 'warning'}
              title={level === 'out' ? 'Out of stock' : 'Running low'}
            >
              {it.reorderLevel > 0
                ? `Reorder at ${quantityLabel(it.reorderLevel, it.unit)}.`
                : 'Nothing left on the shelf.'}
            </Banner>
          )}

          <Card>
            <DetailRow label="Category" value={it.categoryId?.name} />
            <DetailRow
              label="Reorder level"
              value={it.reorderLevel > 0 ? quantityLabel(it.reorderLevel, it.unit) : 'Not set'}
            />
            <DetailRow
              label="Unit cost"
              value={`${formatMoney(it.unitCostMinor)} per ${unitLabel(it.unit, false)}`}
            />
            <DetailRow label="Location" value={it.location} last={!it.description} />
            {it.description ? <DetailRow label="Notes" value={it.description} last /> : null}
          </Card>

          {canRecord && (
            <Button
              label="Record movement"
              icon="swap"
              onPress={() =>
                router.push({ pathname: '/modules/inventory/record', params: { itemId: it._id } })
              }
            />
          )}
        </>
      )}

      <View className="gap-2.5">
        <SectionTitle title="Recent movements" />
        {movements.isLoading ? (
          <Card className="h-32 opacity-60" />
        ) : movements.isError ? (
          <Banner tone="danger" title="Couldn't load movements">
            Pull down to try again.
          </Banner>
        ) : list.length === 0 ? (
          <Card>
            <EmptyState
              icon="history"
              title="No movements yet"
              description="Receipts, issues, returns and adjustments show up here."
            />
          </Card>
        ) : (
          <Card>
            {list.map((m, i) => (
              <MovementRow key={m._id} m={m} unit={it?.unit} last={i === list.length - 1} />
            ))}
          </Card>
        )}
        {total > list.length && (
          <Text className="px-1 text-center text-xs text-muted-foreground">
            Latest {list.length} of {total} — the full ledger is on the web.
          </Text>
        )}
      </View>
    </Screen>
  );
}

function MovementRow({
  m,
  unit,
  last,
}: {
  m: InventoryMovement;
  unit?: Parameters<typeof unitLabel>[0];
  last: boolean;
}) {
  const inbound = m.quantityChange > 0;
  const details = [m.party, m.reference ? `Ref ${m.reference}` : null].filter(Boolean).join(' · ');
  return (
    <View
      accessible
      accessibilityLabel={`${MOVEMENT_LABEL[m.type].label} ${Math.abs(m.quantityChange)}${details ? `, ${details}` : ''}, ${formatDate(m.occurredAt)}`}
      className={`gap-1 px-4 py-3 ${last ? '' : 'border-b border-border'}`}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-base font-medium text-foreground">
          {MOVEMENT_LABEL[m.type].label}
        </Text>
        <Text
          className={`text-base font-semibold ${inbound ? 'text-success' : 'text-destructive'}`}
        >
          {inbound ? '+' : '−'}
          {formatNumber(Math.abs(m.quantityChange))}
        </Text>
      </View>
      {details ? (
        <Text className="text-sm text-foreground/80" numberOfLines={2}>
          {details}
        </Text>
      ) : null}
      {m.note ? (
        <Text className="text-xs text-muted-foreground" numberOfLines={2}>
          {m.note}
        </Text>
      ) : null}
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-xs text-muted-foreground" numberOfLines={1}>
          {formatDate(m.occurredAt, true)} · {fullName(m.recordedByUserId)}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Balance {unit ? quantityLabel(m.balanceAfter, unit) : formatNumber(m.balanceAfter)}
        </Text>
      </View>
    </View>
  );
}
