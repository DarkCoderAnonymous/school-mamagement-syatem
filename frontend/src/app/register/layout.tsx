import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PRODUCT_NAME } from '@/lib/site';

// The page is a client component, so its title lives here. Not indexed (root layout default).
// A plain-string title would drop the root's "| Principle" template for /register/status.
export const metadata: Metadata = {
  title: { default: 'Register your school', template: `%s | ${PRODUCT_NAME}` },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
