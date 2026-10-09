import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/** Indexable pages only: one that opts into `robots: { index: true }` belongs here. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: 'weekly', priority: 1 }];
}
