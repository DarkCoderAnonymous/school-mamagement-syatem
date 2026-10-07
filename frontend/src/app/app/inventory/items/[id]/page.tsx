'use client';

import { use, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Pencil, RotateCcw, Scale, Trash2 } from 'lucide-react';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { PermissionGate } from '@/components/auth/permission-gate';
import { DataTable } from '@/components/data/data-table';
import { DetailList } from '@/components/data/detail-list';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { MOVEMENT_LABEL, UNIT_LABEL } from '@/lib/labels';
import { getInventoryItem, listItemMovements } from '@/lib/api/school';
import type { MovementType } from '@/lib/api/types';
import { ItemDialog, MovementDialog } from '../../inventory-dialogs';
import { ledgerColumns, stockState } from '../../ledger';

const ACTIONS: { type: MovementType; icon: typeof ArrowDownToLine }[] = [
  { type: 'RECEIVE', icon: ArrowDownToLine },
  { type: 'ISSUE', icon: ArrowUpFromLine },
  { type: 'RETURN', icon: RotateCcw },
  { type: 'WRITE_OFF', icon: Trash2 },
  { type: 'ADJUST', icon: Scale },
];

export default function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const url = useUrlState();
  const fmt = useSchoolFormat();
  const [editing, setEditing] = useState(false);
  const [movementType, setMovementType] = useState<MovementType>();

  const item = useQuery({ queryKey: ['inventory-items', id], queryFn: () => getInventoryItem(id) });
  const ledgerParams = { page: url.getNumber('page', 1), limit: url.getNumber('limit', 25) };
  const ledger = useQuery({
    queryKey: ['inventory-movements', { itemId: id, ...ledgerParams }],
    queryFn: () => listItemMovements(id, ledgerParams),
  });
  const columns = useMemo(() => ledgerColumns(fmt, false), [fmt]);

  if (item.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }
  if (item.isError || !item.data) {
    return (
      <div className="rounded-xl border">
        <ErrorState error={item.error} onRetry={() => void item.refetch()} title="Couldn't load this item" />
      </div>
    );
  }

  const i = item.data;
  const state = stockState(i);
  const unit = UNIT_LABEL[i.unit];

  return (
    <div className="space-y-6">
      <PageHeader
        title={i.name}
        description={i.categoryId?.name}
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Inventory', href: '/app/inventory' },
          { label: i.name },
        ]}
        meta={
          <div className="flex items-center gap-2 pt-1">
            <StatusBadge status={state.status} label={state.label} />
            <span className="text-muted-foreground font-mono text-xs">{i.sku}</span>
          </div>
        }
        action={
          <PermissionGate permission={Permission.INVENTORY_MANAGE}>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" />
              Edit details
            </Button>
          </PermissionGate>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <Card>
          <CardContent className="space-y-5 p-6">
            <div>
              <p className="text-muted-foreground text-xs">In stock</p>
              <p className="text-4xl font-semibold tracking-tight tabular-nums">{i.quantityOnHand}</p>
              <p className="text-muted-foreground text-sm">
                {i.quantityOnHand === 1 ? unit.one : unit.many}
                {i.reorderLevel > 0 && ` · reorder at ${i.reorderLevel}`}
              </p>
            </div>
            <PermissionGate permission={Permission.INVENTORY_STOCK_RECORD}>
              <div className="grid grid-cols-2 gap-2">
                {ACTIONS.map(({ type, icon: Icon }) => (
                  <Button
                    key={type}
                    variant={type === 'RECEIVE' ? 'default' : 'outline'}
                    className={type === 'ADJUST' ? 'col-span-2' : undefined}
                    disabled={(type === 'ISSUE' || type === 'WRITE_OFF') && i.quantityOnHand === 0}
                    onClick={() => setMovementType(type)}
                  >
                    <Icon className="size-4" />
                    {MOVEMENT_LABEL[type].verb}
                  </Button>
                ))}
              </div>
            </PermissionGate>
            <DetailList
              columns={1}
              className="border-t pt-5"
              items={[
                { label: 'Unit cost', value: fmt.money(i.unitCostMinor) },
                { label: 'Stock value', value: fmt.money(i.unitCostMinor * i.quantityOnHand) },
                { label: 'Location', value: i.location },
                { label: 'Notes', value: i.description },
              ]}
            />
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="font-semibold">Stock history</h2>
          <DataTable
            columns={columns}
            data={ledger.data?.items}
            meta={ledger.data?.meta}
            loading={ledger.isLoading}
            error={ledger.error}
            onRetry={() => void ledger.refetch()}
            getRowId={(row) => row._id}
            exportFileName={`stock-history-${i.sku}`}
            emptyTitle="No movements yet"
            emptyDescription="Receipts, issues and adjustments for this item appear here."
          />
        </div>
      </div>

      <ItemDialog open={editing} onOpenChange={setEditing} item={i} />
      <MovementDialog item={i} type={movementType} onOpenChange={(open) => !open && setMovementType(undefined)} />
    </div>
  );
}
