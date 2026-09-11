'use client';

import { useMemo, useState } from 'react';
import {
  columnVisibilityFeature,
  rowSelectionFeature,
  tableFeatures,
  type ColumnDef,
  type ColumnVisibilityState,
  type RowData,
  type RowSelectionState,
} from '@tanstack/table-core';
import { useTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useUrlState } from '@/hooks/use-url-state';
import type { PaginationMeta } from './pagination';
import { Pagination } from './pagination';

/**
 * TanStack Table v9 requires features to be registered explicitly (they are
 * tree-shakeable — you pay only for what you register). We register exactly
 * two: column visibility and row selection.
 *
 * Sorting and pagination are deliberately absent. Those are SERVER-side here,
 * driven by the URL, because a school's student list is tens of thousands of
 * rows; registering the client row models would invite someone to sort a
 * single page and believe they sorted the table.
 */
export const dataTableFeatures = tableFeatures({ columnVisibilityFeature, rowSelectionFeature });
export type DataTableFeatures = typeof dataTableFeatures;

/** Column definition bound to this table's feature set. Use in every list screen. */
export type DataTableColumn<T extends RowData> = ColumnDef<DataTableFeatures, T>;

export interface DataTableProps<T extends RowData> {
  columns: DataTableColumn<T>[];
  data: T[] | undefined;
  meta?: PaginationMeta;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Column ids that can be sorted; sorting is server-side, via the URL. */
  sortableColumns?: string[];
  getRowId?: (row: T) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Rendered above the table when at least one row is selected. */
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode;
  enableSelection?: boolean;
  exportFileName?: string;
  toolbar?: React.ReactNode;
  onRowClick?: (row: T) => void;
}

/**
 * The one table every list screen uses.
 *
 * Pagination and sorting are SERVER-side and live in the URL (?page, ?sort),
 * because a school's student list is tens of thousands of rows — fetching them
 * all to sort in the browser is not an option. TanStack Table here is doing
 * rendering, selection and column visibility only; it is deliberately not
 * given a sorted/paginated row model.
 */
export function DataTable<T extends RowData>({
  columns,
  data,
  meta,
  loading = false,
  error,
  onRetry,
  sortableColumns = [],
  getRowId,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  emptyAction,
  bulkActions,
  enableSelection = false,
  exportFileName = 'export',
  toolbar,
  onRowClick,
}: DataTableProps<T>) {
  const url = useUrlState();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});

  const sortParam = url.get('sort');
  const sortDir: 'asc' | 'desc' = sortParam?.startsWith('-') ? 'desc' : 'asc';
  const sortKey = sortParam?.replace(/^-/, '');

  const selectionColumn = useMemo<DataTableColumn<T>>(
    () => ({
      id: '__select',
      header: ({ table }) => (
        <input
          type="checkbox"
          className="accent-primary size-4 cursor-pointer align-middle"
          aria-label="Select all rows on this page"
          checked={table.getIsAllRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected();
          }}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          className="accent-primary size-4 cursor-pointer align-middle"
          aria-label="Select row"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
        />
      ),
      enableHiding: false,
      size: 40,
    }),
    [],
  );

  const allColumns = useMemo(
    () => (enableSelection ? [selectionColumn, ...columns] : columns),
    [columns, enableSelection, selectionColumn],
  );

  const table = useTable<DataTableFeatures, T>({
    features: dataTableFeatures,
    data: data ?? [],
    columns: allColumns,
    state: { rowSelection, columnVisibility },
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    enableRowSelection: enableSelection,
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id]);
  const clearSelection = () => setRowSelection({});

  const toggleSort = (columnId: string) => {
    if (sortKey === columnId) url.set({ sort: sortDir === 'asc' ? `-${columnId}` : columnId });
    else url.set({ sort: columnId });
  };

  /**
   * Exports the rows currently on screen. Deliberately not "all pages": that
   * would be an unbounded server request behind an innocuous-looking button.
   * A full export belongs in Reports, where it can be queued as a job.
   */
  const exportCsv = () => {
    const visible = table.getVisibleLeafColumns().filter((c) => c.id !== '__select');
    const header = visible.map((c) => String(c.columnDef.header ?? c.id));
    const rows = table.getRowModel().rows.map((row) =>
      visible.map((col) => {
        const value = row.getValue(col.id);
        if (value === null || value === undefined) return '';
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }),
    );
    const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');
    // BOM so Excel opens UTF-8 (names with non-Latin characters) correctly.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${exportFileName}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const columnCount = table.getVisibleLeafColumns().length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {enableSelection && selectedIds.length > 0 && bulkActions && (
            <div className="bg-accent text-accent-foreground flex items-center gap-2 rounded-md px-3 py-1.5 text-sm">
              <span className="font-medium tabular-nums">{selectedIds.length} selected</span>
              {bulkActions(selectedIds, clearSelection)}
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="border-border bg-background hover:bg-muted focus-visible:ring-ring inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2">
              <Columns3 className="size-4" />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Show columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide() && c.id !== '__select')
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    closeOnClick={false}
                    onCheckedChange={() => column.toggleVisibility()}
                  >
                    {String(column.columnDef.header ?? column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data?.length}>
            <Download className="size-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="bg-card overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/50 sticky top-0 z-10">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = sortableColumns.includes(header.column.id);
                  const isSorted = sortKey === header.column.id;
                  return (
                    <TableHead key={header.id} className="text-[0.8125rem] font-medium whitespace-nowrap">
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(header.column.id)}
                          className="hover:text-foreground -mx-1 flex items-center gap-1 rounded px-1 transition-colors"
                          aria-label={`Sort by ${String(header.column.columnDef.header ?? header.column.id)}`}
                        >
                          <table.FlexRender header={header} />
                          {isSorted ? (
                            sortDir === 'asc' ? (
                              <ArrowUp className="size-3.5" />
                            ) : (
                              <ArrowDown className="size-3.5" />
                            )
                          ) : (
                            <ChevronsUpDown className="size-3.5 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {loading &&
              // Skeletons shaped like the real rows, so the table doesn't
              // resize when data lands.
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: columnCount }).map((__, j) => (
                    <TableCell key={`skeleton-${i}-${j}`}>
                      <Skeleton className="h-4 w-full max-w-32" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}

            {!loading && error != null && (
              <TableRow>
                <TableCell colSpan={columnCount} className="p-0">
                  <ErrorState error={error} onRetry={onRetry} />
                </TableCell>
              </TableRow>
            )}

            {!loading && !error && table.getRowModel().rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={columnCount} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              !error &&
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(onRowClick && 'hover:bg-muted/50 cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2.5">
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {meta && !error && <Pagination meta={meta} />}
    </div>
  );
}
