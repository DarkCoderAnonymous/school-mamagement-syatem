import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { stagger } from '@/lib/motion';

/** An italic display-face phrase inside a section heading — the accent without the underline. */
export function DisplayItalic({ children }: { children: ReactNode }) {
  return <em className="font-display pr-[0.04em] font-normal tracking-[-0.01em]">{children}</em>;
}

/**
 * The one or two words a public headline leans on: set in the italic display
 * face, with a hand-drawn underline in the warm highlight that draws itself
 * once on arrival. The underline is decoration only — the words carry the
 * meaning — so it's hidden from assistive tech.
 */
export function HeadlineAccent({
  children,
  delay = 450,
  className,
}: {
  children: ReactNode;
  /** When the underline starts drawing, after the headline has landed. */
  delay?: number;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-block whitespace-nowrap', className)}>
      <span className="font-display relative z-10 pr-[0.06em] font-normal tracking-[-0.01em] italic">
        {children}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 300 16"
        preserveAspectRatio="none"
        className="text-highlight absolute inset-x-0 -bottom-[0.08em] h-[0.28em] w-full overflow-visible"
      >
        <path
          d="M3 11.5C58 5.5 120 3.5 178 5.5c40 1.4 80 3.6 119 7"
          pathLength={1}
          fill="none"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray="1 1.1"
          className="animate-draw"
          style={stagger(0, 0, delay)}
        />
      </svg>
    </span>
  );
}
