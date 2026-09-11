import type { Metadata } from 'next';
import { Inter, Noto_Sans_Arabic, JetBrains_Mono } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'School Management System',
  description: 'Multi-tenant School Management SaaS',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${arabic.variable} ${mono.variable} h-full antialiased`}
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
