'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Boxes, MoreHorizontal, PackageX, Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUrlState } from '@/hooks/use-url-state';
import { useInventoryCategoryOptions } from '@/hooks/use-school-options';
import { usePermission } from '@/lib/permissions';
import { useSchoolFormat } from '@/lib/format';
import { errorMessage } from '@/lib/form-errors';
import { MOVEMENT_LABEL, UNIT_LABEL } from '@/lib/labels';
import { archiveInventoryItem, getInventorySummary, listInventoryItems } from '@/lib/api/school';
import type { InventoryItem, MovementType } from '@/lib/api/types';
import { ItemDialog, MovementDialog } from './inventory-dialogs';
import { stockState } from './ledger';

export default function InventoryItemsPage() {
  const url = useUrlState();
  const router = useRouter();
  const can = usePermission();
  const fmt = useSchoolFormat();
  const queryClient = useQueryClient();
  const categories = useInventoryCategoryOptions();
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item?: InventoryItem }>({ open: false });
  const [movement, setMovement] = useState<{ item?: InventoryItem; type?: MovementType }>({});
  const [archiving, setArchiving] = useState<InventoryItem>();

  const summary = useQuery({ queryKey: ['inventory-summary'], queryFn: getInventorySummary });
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    sort: url.get('sort') ?? 'name',
    search: url.get('search'),
    categoryId: url.get('categoryId'),
    stock: url.get('stock'),
  };
  const query = useQuery({ queryKey: ['inventory-items', params], queryFn: () => listInventoryItems(params) });
  const filtered = Boolean(params.search || params.categoryId || params.stock);

  const archive = useMutation({
    mutationFn: (item: InventoryItem) => archiveInventoryItem(item._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      await queryClient.invalidateQueries({ queryKey: ['inventory-summary'] });
      toast.success('Item archived');
      setArchiving(undefined);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't archive the item")),
  });

  const columns = useMemo<DataTableColumn<InventoryItem>[]>(
    () => [
      {
        id: 'name',
        header: 'Item',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.name}</p>
            <p className="text-muted-foreground font-mono text-xs">{row.original.sku}</p>
          </div>
        ),
      },
      { id: 'category', header: 'Category', cell: ({ row }) => row.original.categoryId?.name ?? '—' },
      {
        id: 'quantityOnHand',
        header: 'In stock',
        cell: ({ row }) => (
          <span className="tabular-nums">
            <span className="font-medium">{row.original.quantityOnHand}</span>{' '}
            <span className="text-muted-foreground text-xs">{UNIT_LABEL[row.original.unit].many}</span>
          </span>
        ),
      },
      {
        id: 'unitCostMinor',
        header: 'Value',
        cell: ({ row }) => (
          <span className="tabular-nums">{fmt.money(row.original.quantityOnHand * row.original.unitCostMinor)}</span>
        ),
      },
      { id: 'location', header: 'Location', cell: ({ row }) => row.original.location ?? <span className="text-muted-foreground">—</span> },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = stockState(row.original);
          return <StatusBadge status={s.status} label={s.label} />;
        },
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => {
          const item = row.original;
          const canStock = can(Permission.INVENTORY_STOCK_RECORD);
          const canManage = can(Permission.INVENTORY_MANAGE);
          if (!canStock && !canManage) return null;
          return (
            <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                  aria-label={`Actions for ${item.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canStock &&
                    (['RECEIVE', 'ISSUE', 'RETURN', 'WRITE_OFF', 'ADJUST'] as MovementType[]).map((type) => (
                      <DropdownMenuItem
                        key={type}
                        disabled={(type === 'ISSUE' || type === 'WRITE_OFF') && item.quantityOnHand === 0}
                        onClick={() => setMovement({ item, type })}
                      >
                        {MOVEMENT_LABEL[type].verb}
                      </DropdownMenuItem>
                    ))}
                  {canStock && canManage && <DropdownMenuSeparator />}
                  {canManage && <DropdownMenuItem onClick={() => setItemDialog({ open: true, item })}>Edit details</DropdownMenuItem>}
                  {canManage && <DropdownMenuItem onClick={() => setArchiving(item)}>Archive</DropdownMenuItem>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [can, fmt],
  );

  const newButton = (
    <PermissionGate permission={Permission.INVENTORY_MANAGE}>
      <Button onClick={() => setItemDialog({ open: true })}>
        <Plus className="size-4" />
        New item
      </Button>
    </PermissionGate>
  );

  const s = summary.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock items"
        description="Everything the school keeps in its stores, how much is left, and what it's worth."
        breadcrumbs={[{ label: 'Dashboard', href: '/app' }, { label: 'Inventory' }]}
        action={newButton}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Items tracked" value={s?.itemCount ?? '—'} hint={s ? `${s.categoryCount} categories` : undefined} icon={Boxes} loading={summary.isLoading} />
        <StatCard label="Stock value" value={s ? fmt.money(s.stockValueMinor) : '—'} hint="At current unit costs" icon={Wallet} loading={summary.isLoading} />
        <StatCard
          label="Low stock"
          value={s?.lowStockCount ?? '—'}
          hint="At or below reorder level"
          icon={AlertTriangle}
          tone={s && s.lowStockCount > 0 ? 'warning' : 'default'}
          loading={summary.isLoading}
          footer={
            s && s.lowStockCount > 0 ? (
              <button type="button" className="text-primary mt-2 text-xs hover:underline" onClick={() => url.set({ stock: 'low', page: undefined })}>
                Show low stock
              </button>
            ) : undefined
          }
        />
        <StatCard
          label="Out of stock"
          value={s?.outOfStockCount ?? '—'}
          icon={PackageX}
          tone={s && s.outOfStockCount > 0 ? 'danger' : 'default'}
          loading={summary.isLoading}
        />
      </div>

      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['name', 'quantityOnHand']}
        getRowId={(row) => row._id}
        onRowClick={(row) => router.push(`/app/inventory/items/${row._id}`)}
        exportFileName="inventory"
        emptyTitle={filtered ? 'No items match these filters' : 'No stock items yet'}
        emptyDescription={
          filtered
            ? 'Try a different search, or clear the filters.'
            : 'Create a category, then add the things you keep — with what’s on the shelf today as opening stock.'
        }
        emptyAction={filtered ? undefined : newButton}
        toolbar={
          <FilterBar
            searchPlaceholder="Search name, code or location…"
            filters={[
              { key: 'categoryId', label: 'Category', options: (categories.data ?? []).map((c) => ({ value: c._id, label: c.name })) },
              {
                key: 'stock',
                label: 'Stock level',
                options: [
                  { value: 'low', label: 'Low stock' },
                  { value: 'out', label: 'Out of stock' },
                  { value: 'in', label: 'In stock' },
                ],
              },
            ]}
          />
        }
      />

      <ItemDialog
        open={itemDialog.open}
        onOpenChange={(open) => setItemDialog((d) => ({ ...d, open }))}
        item={itemDialog.item}
        onCreated={(item) => router.push(`/app/inventory/items/${item._id}`)}
      />
      <MovementDialog item={movement.item} type={movement.type} onOpenChange={(open) => !open && setMovement({})} />
      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => !open && setArchiving(undefined)}
        title={`Archive ${archiving?.name ?? 'item'}?`}
        description={
          archiving && archiving.quantityOnHand > 0
            ? `There are still ${archiving.quantityOnHand} in stock. Write them off first so the ledger records where they went.`
            : 'The item is hidden from lists. Its stock history is kept.'
        }
        confirmLabel="Archive item"
        destructive
        pending={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
      />
    </div>
  );
}
