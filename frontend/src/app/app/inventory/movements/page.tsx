'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { useUrlState } from '@/hooks/use-url-state';
import { useSchoolFormat } from '@/lib/format';
import { MOVEMENT_LABEL } from '@/lib/labels';
import { listInventoryMovements } from '@/lib/api/school';
import type { MovementType } from '@/lib/api/types';
import { ledgerColumns } from '../ledger';

export default function InventoryMovementsPage() {
  const url = useUrlState();
  const fmt = useSchoolFormat();
  const params = {
    page: url.getNumber('page', 1),
    limit: url.getNumber('limit', 25),
    type: url.get('type'),
    search: url.get('search'),
  };
  const query = useQuery({ queryKey: ['inventory-movements', params], queryFn: () => listInventoryMovements(params) });
  const columns = useMemo(() => ledgerColumns(fmt, true), [fmt]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock movements"
        description="Every receipt, issue, return, write-off and adjustment, newest first. Entries can't be edited — a mistake is corrected with an adjustment, so the record stays true."
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Inventory', href: '/app/inventory' },
          { label: 'Stock movements' },
        ]}
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        getRowId={(row) => row._id}
        exportFileName="stock-movements"
        emptyTitle={params.type || params.search ? 'No movements match' : 'No stock movements yet'}
        emptyDescription={params.type || params.search ? 'Clear the filters to see everything.' : 'Movements appear here as stock is received and issued.'}
        toolbar={
          <FilterBar
            searchPlaceholder="Search who, reference or note…"
            filters={[
              {
                key: 'type',
                label: 'Movement',
                options: (Object.keys(MOVEMENT_LABEL) as MovementType[]).map((t) => ({ value: t, label: MOVEMENT_LABEL[t].label })),
              },
            ]}
          />
        }
      />
    </div>
  );
}
