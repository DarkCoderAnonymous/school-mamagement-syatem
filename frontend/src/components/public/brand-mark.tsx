import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRODUCT_NAME } from '@/lib/site';

export { PRODUCT_NAME };

/**
 * Logo mark + wordmark. `hideWordmarkOnMobile` keeps the site header from
 * crowding its buttons at 320px.
 */
export function BrandMark({
  href = '/',
  hideWordmarkOnMobile = false,
  className,
}: {
  href?: string;
  hideWordmarkOnMobile?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'focus-visible:ring-ring/50 inline-flex items-center gap-2.5 rounded-md font-semibold tracking-tight outline-none focus-visible:ring-3',
        className,
      )}
    >
      {/* Accent into teal, with a top-edge highlight: the mark reads as an object, not a flat chip. */}
      <span className="text-primary-foreground flex size-8 items-center justify-center rounded-lg bg-linear-135 from-[var(--primary)] to-[color-mix(in_oklch,var(--primary),var(--chart-2)_55%)] shadow-[inset_0_1px_0_0_oklch(1_0_0/0.25),var(--shadow-sm)]">
        <GraduationCap className="size-[18px]" aria-hidden="true" />
      </span>
      <span className={cn('text-[0.9375rem]', hideWordmarkOnMobile && 'sr-only sm:not-sr-only')}>
        {PRODUCT_NAME}
      </span>
    </Link>
  );
}
