import type { ComponentProps } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A native <select>, styled to match Input. Used in forms rather than the
 * popover Select: it registers directly with react-hook-form, opens the
 * platform picker on phones (far better than a popover for a long class
 * list), and is keyboard/screen-reader correct with no extra work.
 */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(
          'border-input bg-background h-9 w-full min-w-0 cursor-pointer appearance-none rounded-lg border py-1 pr-8 pl-2.5 text-base shadow-xs transition-[color,border-color,box-shadow] hover:border-[color-mix(in_oklch,var(--input),var(--foreground)_18%)] dark:shadow-none outline-none md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-invalid:ring-3',
          'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 [&>option]:bg-popover',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
    </div>
  );
}
