import type { Plan } from './api/types';

/** "Free for 7 days" for a $0 weekly trial plan; otherwise "$49.00/monthly" etc. */
export function formatPlanPrice(
  plan: Pick<Plan, 'priceMinor' | 'currency' | 'billingCycle'>,
): string {
  if (plan.priceMinor === 0 && plan.billingCycle === 'WEEKLY') {
    return 'Free for 7 days';
  }
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency,
  }).format(plan.priceMinor / 100);
  return `${amount}/${plan.billingCycle.toLowerCase()}`;
}

const PERIOD_LABEL: Record<Plan['billingCycle'], string> = {
  WEEKLY: 'week',
  MONTHLY: 'month',
  QUARTERLY: 'quarter',
  ANNUAL: 'year',
};

/**
 * Amount and period separately, for layouts that set the price large and the
 * period small. A free weekly plan is a trial, so it has no period to show.
 */
export function planPriceParts(plan: Pick<Plan, 'priceMinor' | 'currency' | 'billingCycle'>): {
  amount: string;
  period: string | null;
  isTrial: boolean;
} {
  if (plan.priceMinor === 0 && plan.billingCycle === 'WEEKLY') {
    return { amount: 'Free', period: '7-day trial', isTrial: true };
  }
  // Whole amounts drop the ".00"; both bounds are set because a currency's
  // default minimum (2 for USD) above an explicit maximum of 0 throws.
  const digits = plan.priceMinor % 100 === 0 ? 0 : 2;
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(plan.priceMinor / 100);
  return { amount, period: `per ${PERIOD_LABEL[plan.billingCycle]}`, isTrial: false };
}
