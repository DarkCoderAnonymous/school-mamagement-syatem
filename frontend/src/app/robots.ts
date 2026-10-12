import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * The signed-in console is closed to crawlers. Sign-in and registration are
 * NOT disallowed: they're kept out of the index by their noindex tag, which a
 * crawler can only see if it's allowed to fetch the page.
 *
 * Robots rules are prefix matches, so a bare `/app` would also block the public
 * `/apple-icon.png`: each area is closed as its exact path (`$`) plus its subtree.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/app$', '/app/', '/admin$', '/admin/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
