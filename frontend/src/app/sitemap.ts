import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Indexable pages only: one that opts into `robots: { index: true }` belongs here.
 * No `changeFrequency`/`priority` (Google ignores both) and no `lastModified`
 * until there's a real content date to report: a build timestamp would claim
 * every deploy changed the page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL }];
}
