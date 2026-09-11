'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

/**
 * Wraps a control with its label, help text and error. Every input in the app
 * goes through this so labels are always associated (`htmlFor`), errors are
 * always announced (`aria-describedby` + `role="alert"`), and required fields
 * are always marked — the accessibility floor, enforced by construction
 * rather than by remembering.
 */
export function Field({
  label,
  htmlFor,
  error,
  help,
  required,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  help?: string;
  required?: boolean;
  children: ReactNode | ((ids: { id: string; describedBy?: string }) => ReactNode);
  className?: string;
}) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const errorId = error ? `${id}-error` : undefined;
  const helpId = help ? `${id}-help` : undefined;
  const describedBy = [errorId, helpId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id} className="text-[0.8125rem]">
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      {typeof children === 'function' ? children({ id, describedBy }) : children}

      {help && !error && (
        <p id={helpId} className="text-muted-foreground text-xs">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
