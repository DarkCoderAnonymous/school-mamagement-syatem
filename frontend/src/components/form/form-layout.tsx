import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Forms are capped at 640px (design-system.md): a field wider than that is
 * harder to scan, not easier. Full-width only for genuinely wide editors like
 * the timetable grid or a marks sheet.
 */
export function FormLayout({
  children,
  onSubmit,
  actions,
  wide = false,
  className,
}: {
  children: ReactNode;
  onSubmit?: (e: React.FormEvent<HTMLFormElement>) => void;
  actions?: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className={cn('space-y-8', wide ? 'max-w-full' : 'max-w-[640px]', className)}
    >
      {children}
      {actions && <div className="flex items-center justify-end gap-2 border-t pt-6">{actions}</div>}
    </form>
  );
}

export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-4 p-6">
        {(title || description) && (
          <div className="space-y-1">
            {title && <h2 className="text-lg leading-7 font-semibold">{title}</h2>}
            {description && <p className="text-muted-foreground text-sm">{description}</p>}
          </div>
        )}
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

/** Two fields side by side on desktop, stacked on mobile. */
export function FormRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
