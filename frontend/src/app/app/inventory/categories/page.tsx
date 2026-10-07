'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Permission } from '@sms/shared';
import { PageHeader } from '@/components/layout/page-header';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar } from '@/components/data/filter-bar';
import { PermissionGate } from '@/components/auth/permission-gate';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useUrlState } from '@/hooks/use-url-state';
import { usePermission } from '@/lib/permissions';
import { errorMessage } from '@/lib/form-errors';
import { archiveInventoryCategory, listInventoryCategories } from '@/lib/api/school';
import type { InventoryCategory } from '@/lib/api/types';
import { CategoryDialog } from '../inventory-dialogs';

export default function InventoryCategoriesPage() {
  const url = useUrlState();
  const can = usePermission();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; category?: InventoryCategory }>({ open: false });
  const [archiving, setArchiving] = useState<InventoryCategory>();

  const params = { page: url.getNumber('page', 1), limit: url.getNumber('limit', 25), sort: url.get('sort') ?? 'name', search: url.get('search') };
  const query = useQuery({ queryKey: ['inventory-categories', params], queryFn: () => listInventoryCategories(params) });

  const archive = useMutation({
    mutationFn: (c: InventoryCategory) => archiveInventoryCategory(c._id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory-categories'] });
      toast.success('Category archived');
      setArchiving(undefined);
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't archive the category")),
  });

  const columns = useMemo<DataTableColumn<InventoryCategory>[]>(
    () => [
      {
        id: 'name',
        header: 'Category',
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            {row.original.description && <p className="text-muted-foreground max-w-md truncate text-xs">{row.original.description}</p>}
          </div>
        ),
      },
      {
        id: 'itemCount',
        header: 'Items',
        cell: ({ row }) =>
          row.original.itemCount > 0 ? (
            <Link href={`/app/inventory?categoryId=${row.original._id}`} className="text-primary tabular-nums hover:underline">
              {row.original.itemCount} item{row.original.itemCount === 1 ? '' : 's'}
            </Link>
          ) : (
            <span className="text-muted-foreground">None</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) =>
          can(Permission.INVENTORY_MANAGE) ? (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="hover:bg-muted focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
                  aria-label={`Actions for ${row.original.name}`}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setDialog({ open: true, category: row.original })}>Edit</DropdownMenuItem>
                  <DropdownMenuItem disabled={row.original.itemCount > 0} onClick={() => setArchiving(row.original)}>
                    {row.original.itemCount > 0 ? 'Archive (move its items first)' : 'Archive'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null,
      },
    ],
    [can],
  );

  const createButton = (
    <PermissionGate permission={Permission.INVENTORY_MANAGE}>
      <Button onClick={() => setDialog({ open: true })}>
        <Plus className="size-4" />
        New category
      </Button>
    </PermissionGate>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory categories"
        description="How stock is grouped — furniture, science lab, stationery, sports."
        breadcrumbs={[
          { label: 'Dashboard', href: '/app' },
          { label: 'Inventory', href: '/app/inventory' },
          { label: 'Categories' },
        ]}
        action={createButton}
      />
      <DataTable
        columns={columns}
        data={query.data?.items}
        meta={query.data?.meta}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        sortableColumns={['name']}
        getRowId={(row) => row._id}
        emptyTitle={params.search ? 'No categories match' : 'No categories yet'}
        emptyDescription={params.search ? 'Try a different name.' : 'Start with a few broad groups; you can add more any time.'}
        emptyAction={params.search ? undefined : createButton}
        toolbar={<FilterBar searchPlaceholder="Search categories…" />}
      />
      <CategoryDialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))} category={dialog.category} />
      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(open) => !open && setArchiving(undefined)}
        title={`Archive ${archiving?.name ?? 'category'}?`}
        confirmLabel="Archive category"
        destructive
        pending={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
      />
    </div>
  );
}
