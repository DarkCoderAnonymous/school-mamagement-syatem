import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useDebounced } from '@/components/ui/form';
import { ChoiceChips, ListRow, PagedList, SearchField } from '@/components/ui/list';
import { Pill } from '@/components/ui/primitives';
import { HeaderButton } from '@/components/management/header-button';
import { useSession } from '@/lib/auth-context';
import {
  listInventoryItems,
  stockLevel,
  unitLabel,
  type InventoryItem,
} from '@/lib/api/management';
import { formatNumber } from '@/lib/format';
import { can } from '@/lib/modules';

type StockFilter = 'low' | 'out';
const FILTERS: { value: StockFilter; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'out', label: 'Out of stock' },
];

/** Stock on hand for every item, with low and out-of-stock filters. */
export default function InventoryScreen() {
  const { user } = useSession();
  const canRecord = can(user?.permissions, Permission.INVENTORY_STOCK_RECORD);
  const canManage = can(user?.permissions, Permission.INVENTORY_MANAGE);
  const [search, setSearch] = useState('');
  const [stock, setStock] = useState<StockFilter>();
  const q = useDebounced(search.trim());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: 'Inventory',
          headerRight:
            canRecord || canManage
              ? () => (
                  <View className="flex-row items-center gap-3">
                    {canRecord && (
                      <HeaderButton
                        label="Record"
                        icon="swap"
                        accessibilityLabel="Record a stock movement"
                        onPress={() => router.push('/modules/inventory/record')}
                      />
                    )}
                    {canManage && (
                      <HeaderButton
                        label="New"
                        accessibilityLabel="Add a new item"
                        onPress={() => router.push('/modules/inventory/new')}
                      />
                    )}
                  </View>
                )
              : undefined,
        }}
      />
      <PagedList
        queryKey={['inventory', 'items', { search: q, stock }]}
        fetchPage={(page) => listInventoryItems({ page, limit: 30, search: q || undefined, stock })}
        keyExtractor={(i) => i._id}
        renderItem={(item) => <ItemRow item={item} />}
        header={
          <View className="gap-3 pb-2">
            {canManage && !q && !stock && (
              <Button
                label="Add new item"
                icon="plus"
                variant="outline"
                onPress={() => router.push('/modules/inventory/new')}
              />
            )}
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder="Search name, SKU or location"
            />
            <ChoiceChips
              label="Stock level"
              options={[{ value: 'all' as const, label: 'All' }, ...FILTERS]}
              value={stock ?? 'all'}
              onChange={(v) => setStock(v === 'all' ? undefined : v)}
            />
          </View>
        }
        empty={
          q || stock
            ? {
                icon: 'search',
                title:
                  stock === 'out' && !q
                    ? 'Nothing is out of stock'
                    : stock === 'low' && !q
                      ? 'Nothing is running low'
                      : 'No items match',
                description: q ? 'Try a different search.' : undefined,
              }
            : {
                icon: 'inventory',
                title: 'No items yet',
                description: canManage
                  ? 'Add the first item with New — what’s on the shelf goes in as its opening stock.'
                  : 'Items appear here once the office adds them.',
              }
        }
      />
    </View>
  );
}

function ItemRow({ item }: { item: InventoryItem }) {
  const level = stockLevel(item);
  return (
    <Card>
      <ListRow
        last
        icon="inventory"
        title={item.name}
        subtitle={[item.categoryId?.name, item.sku].filter(Boolean).join(' · ')}
        accessibilityLabel={`${item.name}, ${item.quantityOnHand} ${unitLabel(item.unit, item.quantityOnHand !== 1)}${level === 'out' ? ', out of stock' : level === 'low' ? ', low stock' : ''}`}
        onPress={() =>
          router.push({ pathname: '/modules/inventory/[id]', params: { id: item._id } })
        }
        trailing={
          <View className="items-end gap-1">
            <Text
              className={`text-base font-semibold ${level === 'out' ? 'text-destructive' : 'text-foreground'}`}
            >
              {formatNumber(item.quantityOnHand)}{' '}
              <Text className="text-xs font-normal text-muted-foreground">
                {unitLabel(item.unit, item.quantityOnHand !== 1)}
              </Text>
            </Text>
            {level === 'out' ? (
              <Pill label="Out" tone="danger" />
            ) : level === 'low' ? (
              <Pill label="Low" tone="warning" />
            ) : null}
          </View>
        }
      />
    </Card>
  );
}
