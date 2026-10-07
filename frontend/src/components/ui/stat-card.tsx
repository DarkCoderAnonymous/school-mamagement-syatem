import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * A single number with its label. Values use tabular figures so a row of
 * StatCards doesn't visibly jitter when the numbers refresh.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  loading = false,
  footer,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  loading?: boolean;
  footer?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning-ink',
    danger: 'text-destructive',
  }[tone];
  // The icon chip carries the same state as the figure (soft tint + ink), so a
  // row of cards reads by colour before it's read by number.
  const chipClass = {
    default: 'bg-muted text-muted-foreground',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning-ink',
    danger: 'bg-destructive-soft text-destructive',
  }[tone];

  return (
    <Card className={className}>
      <CardContent className="space-y-1 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground truncate text-[0.8125rem] font-medium">{label}</p>
          {Icon && (
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', chipClass)}>
              <Icon className="size-4" />
            </span>
          )}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className={cn('text-2xl font-semibold tracking-tight tabular-nums', toneClass)}>{value}</p>
        )}
        {hint && !loading && <p className="text-muted-foreground text-xs">{hint}</p>}
        {footer}
      </CardContent>
    </Card>
  );
}
