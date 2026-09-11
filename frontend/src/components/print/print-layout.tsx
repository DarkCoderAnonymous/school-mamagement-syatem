import type { ReactNode } from 'react';

/**
 * Chrome-free wrapper for anything that gets printed: fee receipts, report
 * cards, class lists, payslips. Screen preview keeps the app's surface; print
 * drops to plain black-on-white at a fixed page size, because a receipt with a
 * dark background wastes a cartridge and a tinted one photocopies badly.
 *
 * Callers render this inside a normal page; `print:hidden` on the app shell
 * keeps the sidebar and toolbar off the paper.
 */
export function PrintLayout({
  title,
  schoolName,
  schoolAddress,
  logoUrl,
  meta,
  children,
  footer,
}: {
  title: string;
  schoolName: string;
  schoolAddress?: string;
  logoUrl?: string | null;
  meta?: { label: string; value: ReactNode }[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="bg-card mx-auto max-w-[210mm] space-y-6 rounded-lg border p-8 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0 print:text-black">
      <header className="flex items-start justify-between gap-6 border-b pb-4">
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- print output must not depend on the Next image optimizer
            <img src={logoUrl} alt="" className="size-12 object-contain" />
          )}
          <div>
            <p className="text-lg font-semibold">{schoolName}</p>
            {schoolAddress && <p className="text-muted-foreground text-xs print:text-black">{schoolAddress}</p>}
          </div>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold">{title}</p>
        </div>
      </header>

      {meta && meta.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {meta.map((item) => (
            <div key={item.label}>
              <dt className="text-muted-foreground text-xs print:text-black">{item.label}</dt>
              <dd className="font-medium tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="space-y-4">{children}</div>

      {footer && <footer className="text-muted-foreground border-t pt-4 text-xs print:text-black">{footer}</footer>}
    </div>
  );
}
