'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { fromMinorUnits, toMinorUnits } from '@/lib/format';

/**
 * Money is stored as an integer in the smallest currency unit everywhere
 * (CLAUDE.md). This component is the boundary: it shows a decimal to the user
 * and hands the form integer minor units, so no float ever reaches the API.
 *
 * The display string is local state rather than derived on every render —
 * otherwise typing "10." would immediately reformat to "10" and eat the
 * decimal point.
 */
export function MoneyInput({
  value,
  onChange,
  currency = 'USD',
  id,
  disabled,
  placeholder = '0.00',
  'aria-describedby': describedBy,
  className,
}: {
  /** Integer, minor units (e.g. 4900 = $49.00). */
  value: number | undefined;
  onChange: (minorUnits: number) => void;
  currency?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  'aria-describedby'?: string;
  className?: string;
}) {
  const [text, setText] = useState(() => (value === undefined ? '' : String(fromMinorUnits(value))));
  const [syncedValue, setSyncedValue] = useState(value);

  // Resync when the form sets a new value from outside (edit form loading, a
  // reset), but leave in-progress typing alone — otherwise "10." would
  // reformat to "10" mid-keystroke and eat the decimal point. Adjusted during
  // render rather than in an effect; see filter-bar.tsx for the same pattern.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (value !== undefined && toMinorUnits(text || '0') !== value) {
      setText(String(fromMinorUnits(value)));
    }
  }

  const symbol = new Intl.NumberFormat('en', { style: 'currency', currency })
    .formatToParts(0)
    .find((part) => part.type === 'currency')?.value;

  return (
    <div className="relative">
      {symbol && (
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
          {symbol}
        </span>
      )}
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={describedBy}
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          // Digits, one dot, at most two decimals.
          if (next !== '' && !/^\d*\.?\d{0,2}$/.test(next)) return;
          setText(next);
          onChange(toMinorUnits(next || '0'));
        }}
        onBlur={() => {
          if (text === '') return;
          setText(fromMinorUnits(toMinorUnits(text)).toFixed(2));
        }}
        className={cn('text-right tabular-nums', symbol && 'pl-7', className)}
      />
    </div>
  );
}
