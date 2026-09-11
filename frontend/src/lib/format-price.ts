import type { Plan } from './api/types';

/** "Free for 7 days" for a $0 weekly trial plan; otherwise "$49.00/monthly" etc. */
export function formatPlanPrice(plan: Pick<Plan, 'priceMinor' | 'currency' | 'billingCycle'>): string {
  if (plan.priceMinor === 0 && plan.billingCycle === 'WEEKLY') {
    return 'Free for 7 days';
  }
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency }).format(
    plan.priceMinor / 100,
  );
  return `${amount}/${plan.billingCycle.toLowerCase()}`;
}
