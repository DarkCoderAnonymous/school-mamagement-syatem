'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUrlState } from '@/hooks/use-url-state';

/** Matches the backend's response envelope `meta` (see utils/response.ts). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PAGE_SIZES = ['10', '25', '50', '100'];

export function Pagination({ meta }: { meta: PaginationMeta }) {
  const url = useUrlState();
  const { page, limit, total, totalPages } = meta;

  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1">
      {/* Keyed on the range, so a new page or filter briefly fades the count in — the change is acknowledged. */}
      <p key={`${first}-${last}-${total}`} className="text-muted-foreground animate-fade-in text-sm tabular-nums" aria-live="polite">
        {total === 0 ? (
          'No results'
        ) : (
          <>
            <span className="text-foreground font-medium">
              {first}–{last}
            </span>{' '}
            of {total}
          </>
        )}
      </p>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Rows</span>
          <Select value={String(limit)} onValueChange={(value) => url.set({ limit: value, page: 1 })}>
            <SelectTrigger size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={size}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => url.set({ page: page - 1 })}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-muted-foreground px-2 text-sm tabular-nums">
            {page} / {Math.max(totalPages, 1)}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => url.set({ page: page + 1 })}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
