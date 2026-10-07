'use client';

import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/form/field';
import { NativeSelect } from '@/components/form/native-select';
import { MoneyInput } from '@/components/form/money-input';
import { useInventoryCategoryOptions } from '@/hooks/use-school-options';
import { applyServerError } from '@/lib/form-errors';
import { MOVEMENT_LABEL, quantityLabel, UNIT_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import {
  createInventoryCategory,
  createInventoryItem,
  recordInventoryMovement,
  updateInventoryCategory,
  updateInventoryItem,
} from '@/lib/api/school';
import type { InventoryCategory, InventoryItem, InventoryUnit, MovementType } from '@/lib/api/types';

/** Every inventory screen reads some mix of these, so a write refreshes them all. */
async function invalidateInventory(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all(
    ['inventory-items', 'inventory-movements', 'inventory-summary', 'inventory-categories', 'dashboard'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

// ─── Item ────────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  name: z.string().trim().min(1, 'Give the item a name').max(120),
  categoryId: z.string().min(1, 'Pick a category'),
  sku: z
    .string()
    .trim()
    .max(30)
    .regex(/^[A-Za-z0-9-]*$/, 'Letters, numbers and dashes only'),
  unit: z.enum(['PIECE', 'BOX', 'PACK', 'SET', 'REAM', 'KG', 'LITRE', 'METRE', 'PAIR']),
  reorderLevel: z.coerce.number().int().min(0, 'Use 0 or more'),
  unitCostMinor: z.number().int().min(0),
  location: z.string().trim().max(80),
  description: z.string().trim().max(500),
  openingQuantity: z.coerce.number().int().min(0, 'Use 0 or more'),
});
type ItemValues = z.infer<typeof itemSchema>;

export function ItemDialog({
  open,
  onOpenChange,
  item,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: InventoryItem;
  onCreated?: (item: InventoryItem) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(item);
  const categories = useInventoryCategoryOptions(open);
  const form = useForm<ItemValues>({ resolver: zodResolver(itemSchema) });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: item?.name ?? '',
      categoryId: item?.categoryId?._id ?? '',
      sku: item?.sku ?? '',
      unit: item?.unit ?? 'PIECE',
      reorderLevel: item?.reorderLevel ?? 0,
      unitCostMinor: item?.unitCostMinor ?? 0,
      location: item?.location ?? '',
      description: item?.description ?? '',
      openingQuantity: 0,
    });
  }, [open, item, form]);

  const mutation = useMutation({
    mutationFn: (v: ItemValues) => {
      const common = {
        name: v.name,
        categoryId: v.categoryId,
        unit: v.unit,
        reorderLevel: v.reorderLevel,
        unitCostMinor: v.unitCostMinor,
        location: v.location || undefined,
        description: v.description || undefined,
      };
      return isEdit
        ? updateInventoryItem(item!._id, common)
        : createInventoryItem({ ...common, sku: v.sku || undefined, openingQuantity: v.openingQuantity });
    },
    onSuccess: async (saved) => {
      await invalidateInventory(queryClient);
      toast.success(isEdit ? 'Item updated' : `${saved.name} added as ${saved.sku}`);
      onOpenChange(false);
      if (!isEdit) onCreated?.(saved);
    },
    onError: (error) => applyServerError(error, form.setError, ['name', 'sku', 'categoryId'], "Couldn't save the item"),
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit item' : 'New stock item'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Quantity changes only through stock movements, so the history stays complete.'
              : 'One kind of thing you keep — chairs, microscopes, marker boxes.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <Field label="Item name" error={errors.name?.message} required>
            {({ id, describedBy }) => (
              <Input id={id} autoFocus aria-describedby={describedBy} aria-invalid={!!errors.name} {...form.register('name')} />
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Category"
              error={errors.categoryId?.message}
              required
              help={categories.data?.length === 0 ? 'Create a category first, under Inventory › Categories.' : undefined}
            >
              {({ id, describedBy }) => (
                <NativeSelect id={id} aria-describedby={describedBy} aria-invalid={!!errors.categoryId} {...form.register('categoryId')}>
                  <option value="">{categories.isLoading ? 'Loading…' : 'Select a category'}</option>
                  {categories.data?.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field
              label="Stock code"
              error={errors.sku?.message}
              help={isEdit ? 'Stock codes are fixed once issued.' : 'Leave blank to issue the next ITM number.'}
            >
              {({ id, describedBy }) => (
                <Input id={id} disabled={isEdit} className="font-mono uppercase" aria-describedby={describedBy} {...form.register('sku')} />
              )}
            </Field>
            <Field label="Unit" error={errors.unit?.message}>
              {({ id, describedBy }) => (
                <NativeSelect id={id} aria-describedby={describedBy} {...form.register('unit')}>
                  {(Object.keys(UNIT_LABEL) as InventoryUnit[]).map((u) => (
                    <option key={u} value={u}>
                      {UNIT_LABEL[u].one}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Unit cost" error={errors.unitCostMinor?.message}>
              {({ id, describedBy }) => (
                <Controller
                  control={form.control}
                  name="unitCostMinor"
                  render={({ field }) => (
                    <MoneyInput id={id} aria-describedby={describedBy} value={field.value} onChange={field.onChange} />
                  )}
                />
              )}
            </Field>
            <Field
              label="Reorder level"
              error={errors.reorderLevel?.message}
              help="Flagged as low stock at or below this. 0 turns it off."
            >
              {({ id, describedBy }) => <Input id={id} type="number" min={0} aria-describedby={describedBy} {...form.register('reorderLevel')} />}
            </Field>
            {!isEdit && (
              <Field label="Opening quantity" error={errors.openingQuantity?.message} help="What's on the shelf today.">
                {({ id, describedBy }) => (
                  <Input id={id} type="number" min={0} aria-describedby={describedBy} {...form.register('openingQuantity')} />
                )}
              </Field>
            )}
          </div>
          <Field label="Storage location" error={errors.location?.message}>
            {({ id, describedBy }) => (
              <Input id={id} placeholder="e.g. Store room 2, shelf B" aria-describedby={describedBy} {...form.register('location')} />
            )}
          </Field>
          <Field label="Notes" error={errors.description?.message}>
            {({ id, describedBy }) => <Textarea id={id} rows={2} aria-describedby={describedBy} {...form.register('description')} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Movement ────────────────────────────────────────────────────────────────

const movementSchema = z
  .object({
    type: z.enum(['RECEIVE', 'ISSUE', 'RETURN', 'WRITE_OFF', 'ADJUST']),
    quantity: z.coerce.number().int('Whole numbers only').refine((n) => n !== 0, 'Quantity cannot be zero'),
    unitCostMinor: z.number().int().min(0).optional(),
    party: z.string().trim().max(120),
    reference: z.string().trim().max(60),
    note: z.string().trim().max(300),
    occurredAt: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.type !== 'ADJUST' && v.quantity < 0) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be positive' });
    if ((v.type === 'ISSUE' || v.type === 'RETURN') && !v.party) {
      ctx.addIssue({ code: 'custom', path: ['party'], message: v.type === 'ISSUE' ? 'Who is it going to?' : 'Who is returning it?' });
    }
    if (v.type === 'ADJUST' && !v.note) ctx.addIssue({ code: 'custom', path: ['note'], message: 'Say why the count changed' });
  });
type MovementValues = z.infer<typeof movementSchema>;

export function MovementDialog({
  item,
  type,
  onOpenChange,
}: {
  item?: InventoryItem;
  type?: MovementType;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const open = Boolean(item && type);
  const form = useForm<MovementValues>({ resolver: zodResolver(movementSchema) });
  const quantity = useWatch({ control: form.control, name: 'quantity' });

  useEffect(() => {
    if (!open || !type || !item) return;
    form.reset({
      type,
      quantity: '' as unknown as number,
      unitCostMinor: type === 'RECEIVE' ? item.unitCostMinor : undefined,
      party: '',
      reference: '',
      note: '',
      occurredAt: new Date().toISOString().slice(0, 10),
    });
  }, [open, type, item, form]);

  const mutation = useMutation({
    mutationFn: (v: MovementValues) => {
      const today = new Date().toISOString().slice(0, 10);
      return recordInventoryMovement(item!._id, {
        type: v.type,
        quantity: v.quantity,
        unitCostMinor: v.type === 'RECEIVE' ? v.unitCostMinor : undefined,
        party: v.party || undefined,
        reference: v.reference || undefined,
        note: v.note || undefined,
        // Today means "now"; a back-dated entry is pinned to that day's start.
        occurredAt: v.occurredAt && v.occurredAt !== today ? new Date(`${v.occurredAt}T00:00:00.000Z`).toISOString() : undefined,
      });
    },
    onSuccess: async ({ item: updated }) => {
      await invalidateInventory(queryClient);
      toast.success(`${MOVEMENT_LABEL[type!].label}: ${updated.name}`, {
        description: `Now ${quantityLabel(updated.quantityOnHand, updated.unit)} in stock.`,
      });
      onOpenChange(false);
    },
    onError: (error) => applyServerError(error, form.setError, ['quantity', 'party', 'note', 'occurredAt'], "Couldn't record that"),
  });

  if (!item || !type) return null;
  const meta = MOVEMENT_LABEL[type];
  const { errors, isSubmitting } = form.formState;
  const qty = Number(quantity) || 0;
  const direction = type === 'RECEIVE' || type === 'RETURN' ? 1 : type === 'ADJUST' ? Math.sign(qty) : -1;
  const after = item.quantityOnHand + direction * (type === 'ADJUST' ? Math.abs(qty) : qty);
  const removing = direction < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {meta.verb} · {item.name}
          </DialogTitle>
          <DialogDescription>{meta.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={type === 'ADJUST' ? 'Difference (+ or −)' : `Quantity (${UNIT_LABEL[item.unit].many})`}
              error={errors.quantity?.message}
              required
            >
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="number"
                  autoFocus
                  inputMode="numeric"
                  min={type === 'ADJUST' ? undefined : 1}
                  max={removing && type !== 'ADJUST' ? item.quantityOnHand : undefined}
                  aria-describedby={describedBy}
                  aria-invalid={!!errors.quantity}
                  {...form.register('quantity')}
                />
              )}
            </Field>
            <Field label="Date" error={errors.occurredAt?.message}>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  aria-describedby={describedBy}
                  {...form.register('occurredAt')}
                />
              )}
            </Field>
          </div>

          <div
            className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
              after < 0 ? 'bg-destructive-soft text-destructive' : 'bg-muted/60',
            )}
            aria-live="polite"
          >
            <span className="text-muted-foreground">In stock</span>
            <span className="tabular-nums">
              {item.quantityOnHand} → <span className="font-semibold">{qty ? after : '…'}</span>
              {after < 0 && ' — not enough stock'}
            </span>
          </div>

          {(type === 'ISSUE' || type === 'RETURN') && (
            <Field
              label={type === 'ISSUE' ? 'Issued to' : 'Returned by'}
              error={errors.party?.message}
              required
              help="A class, department or person — e.g. “Grade 7-B” or “Science dept”."
            >
              {({ id, describedBy }) => (
                <Input id={id} aria-describedby={describedBy} aria-invalid={!!errors.party} {...form.register('party')} />
              )}
            </Field>
          )}
          {type === 'RECEIVE' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Unit cost" help="Updates the item's current cost.">
                {({ id, describedBy }) => (
                  <Controller
                    control={form.control}
                    name="unitCostMinor"
                    render={({ field }) => (
                      <MoneyInput id={id} aria-describedby={describedBy} value={field.value} onChange={field.onChange} />
                    )}
                  />
                )}
              </Field>
              <Field label="Supplier / from" error={errors.party?.message}>
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...form.register('party')} />}
              </Field>
            </div>
          )}
          <Field label="Reference" error={errors.reference?.message} help="Invoice, delivery note or requisition number.">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} {...form.register('reference')} />}
          </Field>
          <Field label="Note" error={errors.note?.message} required={type === 'ADJUST'}>
            {({ id, describedBy }) => (
              <Textarea id={id} rows={2} aria-describedby={describedBy} aria-invalid={!!errors.note} {...form.register('note')} />
            )}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} variant={removing && type === 'WRITE_OFF' ? 'destructive' : 'default'}>
              {isSubmitting ? 'Saving…' : meta.verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Category ────────────────────────────────────────────────────────────────

const categorySchema = z.object({
  name: z.string().trim().min(1, 'Give the category a name').max(60),
  description: z.string().trim().max(200),
});
type CategoryValues = z.infer<typeof categorySchema>;

export function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: InventoryCategory;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(category);
  const form = useForm<CategoryValues>({ resolver: zodResolver(categorySchema), defaultValues: { name: '', description: '' } });
  useEffect(() => {
    if (open) form.reset({ name: category?.name ?? '', description: category?.description ?? '' });
  }, [open, category, form]);

  const mutation = useMutation({
    mutationFn: (v: CategoryValues) => {
      const payload = { name: v.name, description: v.description || undefined };
      return isEdit ? updateInventoryCategory(category!._id, payload) : createInventoryCategory(payload);
    },
    onSuccess: async () => {
      await invalidateInventory(queryClient);
      toast.success(isEdit ? 'Category updated' : 'Category created');
      onOpenChange(false);
    },
    onError: (error) => applyServerError(error, form.setError, ['name'], "Couldn't save the category"),
  });
  const { errors, isSubmitting } = form.formState;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle>
          <DialogDescription>Group stock the way your storekeeper thinks about it.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((v) => mutation.mutateAsync(v))} noValidate className="space-y-4">
          <Field label="Name" error={errors.name?.message} required>
            {({ id, describedBy }) => (
              <Input id={id} autoFocus placeholder="e.g. Science lab" aria-describedby={describedBy} aria-invalid={!!errors.name} {...form.register('name')} />
            )}
          </Field>
          <Field label="Description" error={errors.description?.message}>
            {({ id, describedBy }) => <Textarea id={id} rows={2} aria-describedby={describedBy} {...form.register('description')} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
