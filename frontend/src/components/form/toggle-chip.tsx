'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A pressable pill for multi-select pickers (classes, fee heads, subjects). */
export function ToggleChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'focus-visible:ring-ring/50 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-3',
        on ? 'border-primary bg-primary/10 text-primary font-medium' : 'hover:bg-muted text-muted-foreground',
      )}
    >
      {on && <Check className="animate-pop size-3" aria-hidden="true" />}
      {children}
    </button>
  );
}
