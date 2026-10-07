import type { ReactNode } from 'react';
import { CalendarCheck, ShieldCheck, Smartphone, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stagger } from '@/lib/motion';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { BrandMark, PRODUCT_NAME } from './brand-mark';
import { DisplayItalic } from './headline-accent';

const HIGHLIGHTS = [
  {
    icon: CalendarCheck,
    title: 'Attendance, exams and results',
    body: 'Take a whole class’s register in seconds and publish results the same day.',
  },
  {
    icon: Wallet,
    title: 'Fees without the spreadsheet',
    body: 'Invoices, receipts and dues tracked per student, down to the last payment.',
  },
  {
    icon: Smartphone,
    title: 'Parents stay in the loop',
    body: 'Attendance, fees and results on their phone.',
  },
  {
    icon: ShieldCheck,
    title: 'Every school kept separate',
    body: 'Your records are never visible to another school on the platform.',
  },
] as const;

/**
 * Split layout for sign-in, password recovery and the school picker: the form
 * on the left where the eye lands first, a brand panel on the right from
 * 1024px up. Below that the panel is dropped entirely rather than squeezed —
 * on a phone the only job is the form.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-screen flex-col px-4 py-5 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <BrandMark />
          <ThemeToggle />
        </header>

        <main className="flex flex-1 items-center justify-center py-10 sm:py-16">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>

        <footer className="text-muted-foreground text-xs">
          © {new Date().getFullYear()} {PRODUCT_NAME}
        </footer>
      </div>

      <aside className="bg-panel text-panel-foreground relative isolate hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:gap-16 lg:p-12 xl:p-16">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="bg-aurora animate-drift absolute -inset-[15%]" />
          <div className="bg-grid text-panel-foreground absolute inset-0" />
        </div>

        {/* Plays once on arrival: the panel lives in the layout, so it doesn't replay between auth pages. */}
        <div className="animate-fade-up relative max-w-md space-y-4" style={stagger(0, 0, 120)}>
          <p className="text-panel-muted text-sm font-medium">One platform, many schools</p>
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-balance xl:text-4xl">
            Everything your school runs on, in one <DisplayItalic>calm workspace.</DisplayItalic>
          </h2>
        </div>

        <ul className="relative grid max-w-lg gap-x-8 gap-y-7 xl:grid-cols-2">
          {HIGHLIGHTS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="animate-fade-up space-y-2" style={stagger(i, 70, 320)}>
              <span className="border-panel-border bg-panel-foreground/5 flex size-9 items-center justify-center rounded-lg border backdrop-blur-sm">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">{title}</p>
              <p className="text-panel-muted text-sm leading-relaxed">{body}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** Title block at the top of every auth form. */
export function AuthHeading({
  title,
  description,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {icon && (
        <div
          className="bg-primary/10 text-primary animate-pop mb-5 flex size-11 items-center justify-center rounded-xl"
          style={stagger(0, 0, 120)}
        >
          {icon}
        </div>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      )}
    </div>
  );
}
