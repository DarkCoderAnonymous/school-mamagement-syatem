import type { CSSProperties } from 'react';

/**
 * Stagger helper for the `animate-*` utilities and <Reveal>, which read a
 * `--delay` custom property (see globals.css). 50ms per item keeps a list
 * reading as one sequence rather than a slow cascade.
 */
export function stagger(index: number, step = 50, base = 0): CSSProperties {
  return { '--delay': `${base + index * step}ms` } as CSSProperties;
}
