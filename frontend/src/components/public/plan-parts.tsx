import { Check } from 'lucide-react';
import type { Plan } from '@/lib/api/types';
import { formatNumber } from '@/lib/format';
import { planPriceParts } from '@/lib/format-price';
import { cn } from '@/lib/utils';

/** Large amount, small period — "$49 per month" / "Free 7-day trial". */
export function PlanPrice({ plan, size = 'lg' }: { plan: Plan; size?: 'lg' | 'sm' }) {
  const { amount, period } = planPriceParts(plan);
  return (
    <p className="flex items-baseline gap-1.5">
      <span
        className={cn(
          'tabular font-semibold tracking-tight',
          size === 'lg' ? 'text-3xl' : 'text-lg',
        )}
      >
        {amount}
      </span>
      {period && <span className="text-muted-foreground text-sm">{period}</span>}
    </p>
  );
}

/** The plan's hard limits as a check list — the numbers people compare plans on. */
export function PlanLimits({ plan, className }: { plan: Plan; className?: string }) {
  const items = [
    `Up to ${formatNumber(plan.limits.students)} students`,
    `Up to ${formatNumber(plan.limits.staff)} staff accounts`,
    plan.limits.storageMb >= 1024
      ? `${formatNumber(Math.round(plan.limits.storageMb / 1024))} GB file storage`
      : `${formatNumber(plan.limits.storageMb)} MB file storage`,
  ];
  if (plan.limits.smsCredits > 0) items.push(`${formatNumber(plan.limits.smsCredits)} SMS credits`);

  return (
    <ul className={cn('space-y-2 text-sm', className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
