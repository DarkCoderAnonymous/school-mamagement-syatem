'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A slowly scrolling strip of everything the product covers — breadth at a
 * glance, without another grid. The list is rendered twice so the loop is
 * seamless; the second copy is hidden from assistive tech.
 *
 * Moving content that starts on its own must be stoppable (WCAG 2.2.2), so
 * there's a real pause button, and hovering pauses it too. Reduced-motion
 * visitors get a static, wrapped list instead.
 */
export function ModuleMarquee({
  items,
  label,
}: {
  items: readonly { icon: LucideIcon; label: string }[];
  label: string;
}) {
  const [paused, setPaused] = useState(false);

  const list = (hidden: boolean) => (
    <ul
      aria-hidden={hidden || undefined}
      className={cn(
        'flex shrink-0 items-center gap-3 pr-3',
        hidden && 'motion-reduce:hidden',
        // Reduced motion: one static list that wraps instead of scrolling.
        'motion-reduce:w-full motion-reduce:shrink motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:pr-0',
      )}
    >
      {items.map(({ icon: Icon, label: itemLabel }) => (
        <li
          key={itemLabel}
          className="bg-card text-foreground flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap shadow-xs"
        >
          <Icon className="text-primary size-4" aria-hidden="true" />
          {itemLabel}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex items-center gap-2">
      <div className="mask-fade-x motion-reduce:mask-none min-w-0 flex-1 overflow-hidden py-1">
        <div
          role="group"
          aria-label={label}
          className={cn(
            'animate-marquee flex w-max hover:[animation-play-state:paused]',
            'motion-reduce:w-full motion-reduce:animate-none',
            paused && '[animation-play-state:paused]',
          )}
        >
          {list(false)}
          {list(true)}
        </div>
      </div>
      <button
        type="button"
        onClick={() => setPaused((p) => !p)}
        aria-pressed={paused}
        aria-label={paused ? 'Resume scrolling' : 'Pause scrolling'}
        className="text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full border outline-none focus-visible:ring-3 motion-reduce:hidden"
      >
        {paused ? (
          <Play className="size-4" aria-hidden="true" />
        ) : (
          <Pause className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
