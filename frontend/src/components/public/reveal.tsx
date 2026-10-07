'use client';

import { useEffect, useRef, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { stagger } from '@/lib/motion';

/**
 * Fades and lifts its content in when it scrolls into view.
 *
 * Only elements that START below the fold are hidden, and only once this has
 * run in the browser — so the server-rendered page, a crawler and a no-JS
 * visitor all see everything, and nothing already on screen blinks out. The
 * state lives in a data attribute rather than React state: revealing
 * shouldn't re-render the subtree it's revealing. Reduced-motion users are
 * left alone entirely.
 */
export function Reveal({
  children,
  className,
  index = 0,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  /** Position in a group, for a 50ms stagger. */
  index?: number;
  as?: ElementType;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;

    el.dataset.reveal = 'hidden';
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        el.dataset.reveal = 'shown';
        observer.disconnect();
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag ref={ref} className={cn(className)} style={stagger(index)}>
      {children}
    </Tag>
  );
}
