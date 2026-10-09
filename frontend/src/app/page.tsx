import type { Metadata } from 'next';
import { PRODUCT_NAME, SITE_DESCRIPTION, SITE_URL } from '@/lib/site';
import { HomePage } from './home-page';

/**
 * The one indexable page (see the root layout). A server component so it can
 * carry its own metadata and structured data; the page itself is the client
 * component in `home-page.tsx`.
 */
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  // `openGraph` replaces the layout's object rather than merging into it.
  openGraph: { type: 'website', siteName: PRODUCT_NAME, locale: 'en_US', url: '/' },
  robots: { index: true, follow: true },
};

const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * No `offers`: prices come from the plans API and can change without a
 * deploy, so a price written here would go stale.
 */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': ORGANIZATION_ID, name: PRODUCT_NAME, url: SITE_URL },
    {
      '@type': 'WebSite',
      name: PRODUCT_NAME,
      url: SITE_URL,
      publisher: { '@id': ORGANIZATION_ID },
    },
    {
      '@type': 'SoftwareApplication',
      name: PRODUCT_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'School management software',
      operatingSystem: 'Web',
      publisher: { '@id': ORGANIZATION_ID },
    },
  ],
};

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static content, but `<` is escaped anyway so the block can never close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
      />
      <HomePage />
    </>
  );
}
