import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { cn } from '@/lib/utils';
import { BrandMark, PRODUCT_NAME } from './brand-mark';

const SECTION_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#roles', label: 'Who it’s for' },
  { href: '/#plans', label: 'Plans' },
] as const;

/**
 * Header for the marketing-facing pages (home, registration, status). The
 * section links collapse away below 768px; Sign in and Register stay, since
 * those are the only two things a visitor on a phone came to do.
 */
export function SiteHeader({ showSectionLinks = true }: { showSectionLinks?: boolean }) {
  return (
    <header className="bg-background/85 supports-backdrop-filter:bg-background/70 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <BrandMark hideWordmarkOnMobile />

        {showSectionLinks && (
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {SECTION_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-3"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <Link href="/login" className={cn(buttonVariants({ variant: 'ghost' }), 'h-9 px-3')}>
            Sign in
          </Link>
          <Link href="/register" className={cn(buttonVariants(), 'h-9 px-3.5')}>
            <span>
              Register<span className="hidden sm:inline"> your school</span>
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <BrandMark />
          <p className="text-muted-foreground text-xs">
            © {new Date().getFullYear()} {PRODUCT_NAME}. All rights reserved.
          </p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link
            href="/login"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Register a school
          </Link>
          <Link
            href="/register/status"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Application status
          </Link>
        </nav>
      </div>
    </footer>
  );
}
