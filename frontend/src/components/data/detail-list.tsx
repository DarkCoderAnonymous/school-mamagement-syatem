import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Label/value pairs for a record's detail page. Empty values show a muted
 * dash rather than vanishing, so a missing phone number reads as "not on
 * file" instead of a layout glitch.
 */
export function DetailList({
  items,
  className,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-8 gap-y-4 text-sm',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {items.map(({ label, value }) => {
        const empty = value === null || value === undefined || value === '';
        return (
          <div key={label} className="min-w-0 space-y-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className={cn('break-words', empty && 'text-muted-foreground')}>{empty ? '—' : value}</dd>
          </div>
        );
      })}
    </dl>
  );
}
