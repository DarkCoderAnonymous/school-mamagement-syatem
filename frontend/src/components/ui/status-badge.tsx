import { cn } from '@/lib/utils';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  success: 'bg-success-soft text-success ring-success/25',
  warning: 'bg-warning-soft text-warning-foreground ring-warning/35',
  danger: 'bg-destructive-soft text-destructive ring-destructive/25',
  info: 'bg-info-soft text-info ring-info/25',
};

/**
 * ONE mapping for every status enum in `shared/`, so "paid" is the same green
 * on the invoice list, the student's fee tab and the daily collection report.
 * Add new statuses here rather than colouring a badge at the call site.
 *
 * Every badge shows its label as text — colour is never the only signal, which
 * is what keeps this readable for colour-blind users and on printed reports.
 */
const STATUS_TONES: Record<string, Tone> = {
  // Registration
  PENDING: 'warning',
  UNDER_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  // School / subscription
  ACTIVE: 'success',
  SUSPENDED: 'danger',
  EXPIRED: 'neutral',
  TRIAL: 'info',
  GRACE: 'warning',
  CANCELLED: 'neutral',
  // User
  INVITED: 'info',
  DISABLED: 'neutral',
  // Attendance
  PRESENT: 'success',
  ABSENT: 'danger',
  LATE: 'warning',
  HALF_DAY: 'warning',
  EXCUSED: 'info',
  // Fees
  PAID: 'success',
  PARTIALLY_PAID: 'warning',
  UNPAID: 'neutral',
  OVERDUE: 'danger',
  REFUNDED: 'info',
  // Workflow
  DRAFT: 'neutral',
  SCHEDULED: 'info',
  PUBLISHED: 'success',
  VERIFIED: 'success',
  LOCKED: 'neutral',
};

/** PENDING → "Pending", PARTIALLY_PAID → "Partially paid". */
export function humanizeStatus(status: string): string {
  const words = status.toLowerCase().split('_');
  return words.map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONE_CLASS[tone],
        className,
      )}
    >
      {label ?? humanizeStatus(status)}
    </span>
  );
}
