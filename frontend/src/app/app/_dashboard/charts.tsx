'use client';

import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The dashboard's chart primitives, built to the dataviz mark specs:
 * columns ≤24px with a 4px rounded data-end and a square baseline, one
 * hairline grid, text in text tokens (never the series colour), and a
 * tooltip on every mark reachable by hover and keyboard focus.
 */

export type MeterTone = 'accent' | 'warning' | 'danger';

/** Fill carries severity; the track is a lighter step of the same ramp, so the state reads across the whole bar. */
const METER_TONE: Record<MeterTone, { track: string; fill: string }> = {
  accent: { track: 'bg-chart-1/15', fill: 'bg-chart-1' },
  warning: { track: 'bg-warning-soft', fill: 'bg-warning' },
  danger: { track: 'bg-destructive-soft', fill: 'bg-destructive' },
};

/** A single ratio against its whole. `label` is what a screen reader hears. */
export function Meter({
  value,
  tone = 'accent',
  label,
  className,
}: {
  value: number;
  tone?: MeterTone;
  label: string;
  className?: string;
}) {
  const ratio = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className={cn('h-2 w-full overflow-hidden rounded-full', METER_TONE[tone].track, className)}
    >
      <div
        className={cn('animate-grow-x h-full origin-left rounded-full', METER_TONE[tone].fill)}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}

/**
 * A hover/focus tooltip anchored above its mark. Content is plain text nodes (never HTML).
 * Marks in the right half of a chart anchor their tooltip's right edge instead
 * of centring it: an invisible tooltip still counts towards the page's scroll
 * width, so a centred one on the last column pushed phones into sideways scroll.
 */
function MarkTooltip({ children, end = false }: { children: ReactNode; end?: boolean }) {
  return (
    <span
      role="tooltip"
      className={cn(
        'bg-popover text-popover-foreground shadow-lg pointer-events-none absolute bottom-full z-10 mb-2 rounded-md px-2 py-1 text-xs whitespace-nowrap opacity-0 ring-1 ring-foreground/[0.08] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
        end ? 'right-0' : 'left-1/2 -translate-x-1/2',
      )}
    >
      {children}
    </span>
  );
}

/**
 * A 14-day attendance sparkline: every day in the de-emphasis ink, today in
 * the accent. A day nobody took the register is a stub, not a zero.
 */
export function Sparkline({
  points,
  describe,
}: {
  points: { key: string; value: number | null; label: string }[];
  describe: (p: { value: number | null; label: string }) => string;
}) {
  return (
    <ol className="flex h-10 items-end gap-[3px]" aria-label="Recent school days">
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <li
            key={p.key}
            tabIndex={0}
            aria-label={describe(p)}
            className="group focus-visible:ring-ring relative flex h-full flex-1 items-end rounded-sm outline-none focus-visible:ring-2"
          >
            <span
              className={cn(
                'animate-grow-y block w-full origin-bottom rounded-t-[3px]',
                p.value === null
                  ? 'bg-foreground/10 h-0.5'
                  : last
                    ? 'bg-chart-1'
                    : 'bg-foreground/20 group-hover:bg-foreground/35',
              )}
              style={
                {
                  height: p.value === null ? undefined : `${Math.max(6, p.value)}%`,
                  '--delay': `${i * 30}ms`,
                } as CSSProperties
              }
            />
            <MarkTooltip end={i >= points.length / 2}>{describe(p)}</MarkTooltip>
          </li>
        );
      })}
    </ol>
  );
}

/** Clean axis maximum: the next 1/2/5 × 10ⁿ above the data. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 5, 10].find((m) => m * exp >= max)!;
  return step * exp;
}

/**
 * Single-series column chart. No legend (the card title names the series);
 * the latest column carries its value on the cap, the axis and tooltips carry
 * the rest. Columns grow from the baseline, staggered 40ms.
 */
export function ColumnChart({
  data,
  formatTick,
  formatValue,
  label,
}: {
  data: { key: string; label: string; fullLabel: string; value: number }[];
  formatTick: (v: number) => string;
  formatValue: (v: number) => string;
  label: string;
}) {
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const ticks = [max, max / 2, 0];

  return (
    <figure aria-label={label} className="grid grid-cols-[auto_1fr] gap-x-2">
      {/* Y axis: three clean ticks, muted, right-aligned to the plot. */}
      <div
        className="text-muted-foreground relative h-36 text-right text-[0.6875rem] tabular-nums"
        aria-hidden="true"
      >
        {ticks.map((t, i) => (
          <span
            key={t}
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
          >
            {formatTick(t)}
          </span>
        ))}
        <span className="invisible">{formatTick(max)}</span>
      </div>

      <div className="relative h-36">
        {/* Hairline gridlines, one step off the surface. */}
        {ticks.map((t, i) => (
          <span
            key={t}
            aria-hidden="true"
            className={cn(
              'absolute inset-x-0 h-px',
              i === ticks.length - 1 ? 'bg-border' : 'bg-border/60',
            )}
            style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
          />
        ))}
        <ol className="relative flex h-full items-end justify-around">
          {data.map((d, i) => {
            const last = i === data.length - 1;
            const pct = (d.value / max) * 100;
            return (
              <li
                key={d.key}
                tabIndex={0}
                aria-label={`${d.fullLabel}: ${formatValue(d.value)}`}
                className="group focus-visible:ring-ring relative flex h-full w-12 items-end justify-center rounded-sm outline-none focus-visible:ring-2"
              >
                {last && d.value > 0 && (
                  <span
                    className="text-foreground absolute text-[0.6875rem] font-medium tabular-nums"
                    style={{ bottom: `calc(${pct}% + 4px)` }}
                  >
                    {formatTick(d.value)}
                  </span>
                )}
                <span
                  className={cn(
                    'animate-grow-y block w-6 origin-bottom rounded-t-[4px] transition-[filter]',
                    'bg-chart-1 group-hover:brightness-110',
                    d.value === 0 && 'bg-transparent',
                  )}
                  style={{ height: `${pct}%`, '--delay': `${i * 40}ms` } as CSSProperties}
                />
                <MarkTooltip end={i >= data.length / 2}>
                  {d.fullLabel}: {formatValue(d.value)}
                </MarkTooltip>
              </li>
            );
          })}
        </ol>
      </div>

      <span aria-hidden="true" />
      <ol
        className="text-muted-foreground mt-1.5 flex justify-around text-[0.6875rem]"
        aria-hidden="true"
      >
        {data.map((d) => (
          <li key={d.key} className="w-12 text-center">
            {d.label}
          </li>
        ))}
      </ol>
    </figure>
  );
}
