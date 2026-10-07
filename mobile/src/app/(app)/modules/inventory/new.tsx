import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Permission } from '@sms/shared';
import { Button } from '@/components/ui/button';
import { FormSection, MoneyField, OptionPicker } from '@/components/ui/form';
import { Icon } from '@/components/ui/icon';
import { Banner } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/text-field';
import { useSession } from '@/lib/auth-context';
import { can } from '@/lib/modules';
import { ApiRequestError } from '@/lib/api/http';
import {
  createInventoryCategory,
  createInventoryItem,
  INVENTORY_UNITS,
  listInventoryCategories,
  unitLabel,
  type InventoryUnit,
} from '@/lib/api/management';
import { parseMoney } from '@/lib/format';

const UNIT_OPTIONS = INVENTORY_UNITS.map((value) => ({
  value,
  label: unitLabel(value, true).replace(/^./, (c) => c.toUpperCase()),
}));
const wholeNumber = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : NaN);

type Errors = Partial<
  Record<'name' | 'category' | 'newCategory' | 'sku' | 'opening' | 'reorder' | 'cost', string>
>;

/**
 * Add a stock item, as the web's item dialog does. Stock already on the shelf
 * goes in as the opening quantity (recorded as a RECEIVE movement); after
 * that the quantity changes only through movements. A new school may have no
 * categories yet, so one can be created right here.
 */
export default function NewItemScreen() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<string>();
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [unit, setUnit] = useState<InventoryUnit>('PIECE');
  const [opening, setOpening] = useState('');
  const [reorder, setReorder] = useState('');
  const [cost, setCost] = useState('');
  const [sku, setSku] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string>();

  const categories = useQuery({
    queryKey: ['inventory', 'categories'],
    queryFn: listInventoryCategories,
    staleTime: 60_000,
  });
  const categoryList = categories.data?.items ?? [];
  // With no categories yet, the only way forward is to create one.
  const creatingCategory = addingCategory || (categories.isSuccess && categoryList.length === 0);

  const openingQty = opening.trim() ? wholeNumber(opening) : 0;
  const reorderQty = reorder.trim() ? wholeNumber(reorder) : 0;
  const costMinor = cost.trim() ? parseMoney(cost) : 0;

  const errors: Errors = {};
  if (!name.trim()) errors.name = 'Name the item';
  if (creatingCategory ? !newCategory.trim() : !categoryId)
    errors[creatingCategory ? 'newCategory' : 'category'] = creatingCategory
      ? 'Name the category'
      : 'Pick a category';
  if (sku.trim() && !/^[A-Za-z0-9-]+$/.test(sku.trim()))
    errors.sku = 'Letters, numbers and dashes only';
  if (!Number.isFinite(openingQty) || openingQty > 1_000_000)
    errors.opening = 'A whole number up to 1,000,000';
  if (!Number.isFinite(reorderQty) || reorderQty > 1_000_000)
    errors.reorder = 'A whole number up to 1,000,000';
  if (costMinor === null) errors.cost = 'Enter an amount like 12.50';
  const valid = Object.keys(errors).length === 0;
  const shown = (k: keyof Errors) => (submitted ? errors[k] : undefined);

  const save = useMutation({
    mutationFn: async () => {
      const category = creatingCategory ? await createInventoryCategory(newCategory.trim()) : null;
      return createInventoryItem({
        name: name.trim(),
        categoryId: category?._id ?? categoryId!,
        sku: sku.trim() ? sku.trim().toUpperCase() : undefined,
        unit,
        reorderLevel: reorderQty,
        unitCostMinor: costMinor ?? 0,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        openingQuantity: openingQty,
      });
    },
    onSuccess: async (item) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      router.replace({ pathname: '/modules/inventory/[id]', params: { id: item._id } });
    },
    onError: async (err) => {
      // The category may have been created before the item failed — show it as a choice next time.
      if (creatingCategory) {
        const { data } = await categories.refetch();
        const made = data?.items.find(
          (c) => c.name.toLowerCase() === newCategory.trim().toLowerCase(),
        );
        if (made) {
          setCategoryId(made._id);
          setAddingCategory(false);
        }
      }
      setServerError(
        err instanceof ApiRequestError ? err.message : 'Check your connection and try again.',
      );
    },
  });

  if (!can(user?.permissions, Permission.INVENTORY_MANAGE)) {
    return (
      <View className="flex-1 bg-background px-4 pt-3">
        <Stack.Screen options={{ title: 'New item' }} />
        <Banner tone="warning" icon="lock" title="Not available">
          Your role can’t add stock items.
        </Banner>
      </View>
    );
  }

  const submit = () => {
    setSubmitted(true);
    setServerError(undefined);
    if (valid) save.mutate();
  };

  return (
    <SafeAreaView edges={['bottom']} className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'New item' }} />
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
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              maxLength={120}
              placeholder="e.g. A4 paper, Whiteboard marker"
              error={shown('name')}
              autoFocus
            />
            {creatingCategory ? (
              <View className="gap-1.5">
                <TextField
                  label="New category"
                  value={newCategory}
                  onChangeText={setNewCategory}
                  maxLength={60}
                  placeholder="e.g. Stationery, Sports, Lab"
                  error={shown('newCategory')}
                  hint={
                    categoryList.length === 0
                      ? 'No categories yet — this one is created with the item.'
                      : undefined
                  }
                />
                {categoryList.length > 0 && (
                  <LinkButton
                    label="Choose an existing category"
                    onPress={() => setAddingCategory(false)}
                  />
                )}
              </View>
            ) : (
              <View className="gap-1.5">
                <OptionPicker
                  label="Category"
                  value={categoryId}
                  options={categoryList.map((c) => ({
                    value: c._id,
                    label: c.name,
                    description: c.description,
                  }))}
                  onChange={setCategoryId}
                  placeholder={categories.isLoading ? 'Loading categories…' : 'Choose a category'}
                  disabled={categories.isLoading}
                  error={shown('category')}
                />
                <LinkButton
                  label="New category"
                  icon="plus"
                  onPress={() => setAddingCategory(true)}
                />
              </View>
            )}
            {categories.isError && (
              <Banner tone="danger">Couldn&apos;t load categories. Go back and try again.</Banner>
            )}
          </FormSection>

          <FormSection title="Stock">
            <OptionPicker
              label="Counted in"
              value={unit}
              options={UNIT_OPTIONS}
              onChange={setUnit}
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <TextField
                  label="In stock now"
                  value={opening}
                  onChangeText={(t) => setOpening(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  maxLength={7}
                  error={shown('opening')}
                />
              </View>
              <View className="flex-1">
                <TextField
                  label="Reorder at"
                  value={reorder}
                  onChangeText={(t) => setReorder(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="0"
                  maxLength={7}
                  error={shown('reorder')}
                />
              </View>
            </View>
            <Text className="px-1 text-xs text-muted-foreground">
              What&apos;s on the shelf is recorded as an opening delivery. The item shows as low
              once it falls to the reorder level (0 = never).
            </Text>
            <MoneyField
              label={`Cost per ${unitLabel(unit, false)}`}
              value={cost}
              onChange={setCost}
              error={shown('cost')}
              hint="Optional — used to value the stock."
            />
          </FormSection>

          <FormSection title="Details (optional)">
            <TextField
              label="Stock code"
              value={sku}
              onChangeText={setSku}
              maxLength={30}
              autoCapitalize="characters"
              placeholder="Issued automatically (ITM-0001)"
              error={shown('sku')}
            />
            <TextField
              label="Kept at"
              value={location}
              onChangeText={setLocation}
              maxLength={80}
              placeholder="e.g. Store room, shelf 3"
            />
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              maxLength={500}
              multiline
              className="h-24 py-3"
              textAlignVertical="top"
            />
          </FormSection>

          {serverError && (
            <Text
              accessibilityRole="alert"
              className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {serverError}
            </Text>
          )}
          {submitted && !valid && !serverError && (
            <Text className="px-1 text-sm text-destructive">
              Fix the highlighted fields to continue.
            </Text>
          )}
          <Button label="Add item" icon="plus" loading={save.isPending} onPress={submit} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LinkButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: 'plus';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={8}
      className="h-9 flex-row items-center gap-1 self-start px-1 active:opacity-60"
    >
      {icon && <Icon name={icon} size={14} color="primary" />}
      <Text className="text-sm font-semibold text-primary">{label}</Text>
    </Pressable>
  );
}
