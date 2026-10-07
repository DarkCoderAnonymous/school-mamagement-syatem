import type { Metadata } from 'next';
import { Inter, Noto_Sans_Arabic, JetBrains_Mono, Newsreader } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/components/providers/query-provider';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { AuthProvider } from '@/components/providers/auth-provider';
import { Toaster } from '@/components/ui/sonner';

/**
 * Typography (see docs/design-system.md): Inter is the working face — it was
 * drawn for UI at small sizes, has genuine tabular figures (used on every
 * table, money column and total), and covers Latin/Cyrillic/Greek. Noto Sans
 * Arabic sits behind it in the same stack so an Arabic- or Urdu-locale school
 * renders in a matched face instead of a browser fallback. JetBrains Mono is
 * for admission numbers, receipt numbers and audit payloads.
 *
 * `display: 'swap'` keeps text readable while the face loads rather than
 * blocking on it.
 */
const sans = Inter({
  variable: '--font-app-sans',
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
});

const arabic = Noto_Sans_Arabic({
  variable: '--font-app-arabic',
  subsets: ['arabic'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  variable: '--font-app-mono',
  subsets: ['latin'],
  display: 'swap',
});

/**
 * Display accent for the public pages only: an italic word or two inside an
 * Inter headline (`font-display`). Never used in the staff console. The
 * optical-size axis lets the italic sharpen at hero sizes.
 */
const display = Newsreader({
  variable: '--font-app-display',
  subsets: ['latin'],
  style: ['italic'],
  axes: ['opsz'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'School Management System',
  description: 'Multi-tenant School Management SaaS',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      // Keeps route changes instant even where smooth anchor scrolling is on (Next 16).
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sans.variable} ${arabic.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
