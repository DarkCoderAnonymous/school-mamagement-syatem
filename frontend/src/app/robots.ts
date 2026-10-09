import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * The signed-in console is closed to crawlers. Sign-in and registration are
 * NOT disallowed: they're kept out of the index by their noindex tag, which a
 * crawler can only see if it's allowed to fetch the page.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app', '/admin'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
