'use client';

import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUrlState } from '@/hooks/use-url-state';

export interface SelectFilter {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

const ALL = '__all';

/**
 * Search + filters for a list screen. Every control writes to the URL, so the
 * filtered view is shareable and the browser's back button behaves.
 *
 * The search box keeps local state and pushes to the URL on a debounce —
 * without that, every keystroke becomes a router update and a request.
 */
export function FilterBar({
  searchPlaceholder = 'Search…',
  searchable = true,
  filters = [],
  children,
}: {
  searchPlaceholder?: string;
  /** False for lists whose endpoint has no text search — never show a box that does nothing. */
  searchable?: boolean;
  filters?: SelectFilter[];
  children?: React.ReactNode;
}) {
  const url = useUrlState();
  const urlSearch = url.get('search') ?? '';
  const [search, setSearch] = useState(urlSearch);
  const [syncedSearch, setSyncedSearch] = useState(urlSearch);

  // Keep in step when the URL changes from elsewhere (back button, Reset).
  // Adjusted during render rather than in an effect: setting state
  // synchronously inside an effect costs an extra render pass and is flagged
  // by the compiler lint. See react.dev "adjusting state when props change".
  if (urlSearch !== syncedSearch) {
    setSyncedSearch(urlSearch);
    setSearch(urlSearch);
  }

  useEffect(() => {
    if (search === urlSearch) return;
    const timer = setTimeout(() => url.set({ search: search || undefined }), 300);
    return () => clearTimeout(timer);
  }, [search, urlSearch, url]);

  const activeCount =
    filters.filter((f) => url.get(f.key)).length + (urlSearch ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {searchable && (
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-label={searchPlaceholder}
          />
        </div>
      )}

      {filters.map((filter) => (
        <Select
          key={filter.key}
          value={url.get(filter.key) ?? ALL}
          onValueChange={(value) => url.set({ [filter.key]: value === ALL ? undefined : value })}
        >
          <SelectTrigger className="w-auto min-w-[9rem]" aria-label={filter.label}>
            {/* Without a render function the trigger shows the raw value ("__all",
                or an ObjectId). Label + choice keeps each filter identifiable. */}
            <SelectValue placeholder={filter.label}>
              {(value: string) => (
                <span className="truncate">
                  <span className="text-muted-foreground">{filter.label}:</span>{' '}
                  {value === ALL || !value ? 'All' : (filter.options.find((o) => o.value === value)?.label ?? 'All')}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any {filter.label.toLowerCase()}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {children}

      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => url.reset()}>
          <X className="size-4" />
          Reset
        </Button>
      )}
    </div>
  );
}
