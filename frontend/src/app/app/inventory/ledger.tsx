'use client';

import Link from 'next/link';
import type { DataTableColumn } from '@/components/data/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { fullName, MOVEMENT_LABEL } from '@/lib/labels';
import { cn } from '@/lib/utils';
import type { InventoryItem, InventoryMovement, MovementType } from '@/lib/api/types';

const TONE: Record<MovementType, string> = {
  RECEIVE: 'PAID',
  RETURN: 'REFUNDED',
  ISSUE: 'SCHEDULED',
  WRITE_OFF: 'OVERDUE',
  ADJUST: 'PENDING',
};

export function MovementBadge({ type }: { type: MovementType }) {
  return <StatusBadge status={TONE[type]} label={MOVEMENT_LABEL[type].label} />;
}

/** Signed change, coloured by direction but never by colour alone: the sign is always shown. */
export function QuantityChange({ value }: { value: number }) {
  return (
    <span className={cn('font-medium tabular-nums', value > 0 ? 'text-success' : 'text-destructive')}>
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </span>
  );
}

/** Columns for a stock ledger. `withItem` adds the item column for the school-wide view. */
export function ledgerColumns(
  fmt: { date: (iso: string, withTime?: boolean) => string },
  withItem: boolean,
): DataTableColumn<InventoryMovement>[] {
  return [
    {
      id: 'occurredAt',
      header: 'Date',
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{fmt.date(row.original.occurredAt)}</span>,
    },
    ...(withItem
      ? [
          {
            id: 'item',
            header: 'Item',
            cell: ({ row }: { row: { original: InventoryMovement } }) => {
              const item = row.original.itemId;
              return item && typeof item === 'object' ? (
                <Link href={`/app/inventory/items/${item._id}`} className="hover:text-primary block min-w-0" onClick={(e) => e.stopPropagation()}>
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="text-muted-foreground font-mono text-xs">{item.sku}</span>
                </Link>
              ) : (
                <span className="text-muted-foreground">Archived item</span>
              );
            },
          } satisfies DataTableColumn<InventoryMovement>,
        ]
      : []),
    { id: 'type', header: 'Movement', cell: ({ row }) => <MovementBadge type={row.original.type} /> },
    {
      id: 'quantityChange',
      header: 'Change',
      cell: ({ row }) => <QuantityChange value={row.original.quantityChange} />,
    },
    {
      id: 'balanceAfter',
      header: 'Balance',
      cell: ({ row }) => <span className="tabular-nums">{row.original.balanceAfter}</span>,
    },
    {
      id: 'details',
      header: 'Details',
      cell: ({ row }) => {
        const m = row.original;
        const parts = [m.party, m.reference && `Ref ${m.reference}`].filter(Boolean);
        return (
          <div className="max-w-xs min-w-0 text-sm">
            {parts.length > 0 && <p className="truncate">{parts.join(' · ')}</p>}
            {m.note && <p className="text-muted-foreground truncate text-xs">{m.note}</p>}
            {!parts.length && !m.note && <span className="text-muted-foreground">—</span>}
          </div>
        );
      },
    },
    {
      id: 'recordedBy',
      header: 'Recorded by',
      cell: ({ row }) => <span className="text-sm whitespace-nowrap">{fullName(row.original.recordedByUserId)}</span>,
    },
  ];
}

/** Stock state for a badge. Status keys reuse the shared status palette. */
export function stockState(item: Pick<InventoryItem, 'quantityOnHand' | 'reorderLevel'>) {
  if (item.quantityOnHand === 0) return { status: 'OVERDUE', label: 'Out of stock' };
  if (item.reorderLevel > 0 && item.quantityOnHand <= item.reorderLevel) return { status: 'PENDING', label: 'Low stock' };
  return { status: 'ACTIVE', label: 'In stock' };
}
