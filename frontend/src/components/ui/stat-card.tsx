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
    warning: 'text-warning-foreground',
    danger: 'text-destructive',
  }[tone];

  return (
    <Card className={className}>
      <CardContent className="space-y-1 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-[0.8125rem] font-medium">{label}</p>
          {Icon && <Icon className="text-muted-foreground size-4" />}
        </div>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className={cn('text-2xl font-semibold tabular-nums', toneClass)}>{value}</p>
        )}
        {hint && !loading && <p className="text-muted-foreground text-xs">{hint}</p>}
        {footer}
      </CardContent>
    </Card>
  );
}
