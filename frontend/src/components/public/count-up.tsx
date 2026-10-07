'use client';

import { useEffect, useRef } from 'react';

/**
 * Counts a number up from zero once, easing out, for the landing page's
 * product preview. Writes to the DOM directly so it costs no re-renders; the
 * final value is what's server-rendered and what reduced-motion users see.
 */
export function CountUp({
  value,
  format,
  duration = 1100,
  delay = 0,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = format(value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    el.textContent = format(0);
    const timer = setTimeout(() => (frame = requestAnimationFrame(tick)), delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      el.textContent = format(value);
    };
  }, [value, format, duration, delay]);

  return <span ref={ref}>{format(value)}</span>;
}
