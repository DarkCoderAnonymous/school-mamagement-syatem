import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/** The consoles' home pages; a trail that only leads back to one of these is redundant. */
const ROOT_HREFS = new Set(['/app', '/admin']);

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * The single page title on every inner page, with optional breadcrumbs and one
 * primary action on the right. Keeping this in one component is what makes
 * "the same action lives in the same place on every screen" true in practice.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  action,
  meta,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  action?: ReactNode;
  meta?: ReactNode;
}) {
  // "Dashboard › Students" on a top-level page only repeats the console's top
  // bar, which already names the section and page. Breadcrumbs earn their
  // space once there's a real trail back (Students › Noah Garcia).
  const trail =
    breadcrumbs && !(breadcrumbs.length <= 2 && ROOT_HREFS.has(breadcrumbs[0]?.href ?? '')) ? breadcrumbs : [];

  return (
    <div className="space-y-3">
      {trail.length > 0 && (
        <nav aria-label="Breadcrumb">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
            {trail.map((crumb, i) => (
              <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="size-3" aria-hidden="true" />}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-foreground rounded-sm transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-foreground font-medium">
                    {crumb.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="truncate text-2xl leading-8 font-semibold">{title}</h1>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
          {meta}
        </div>
        {action && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{action}</div>}
      </div>
    </div>
  );
}
