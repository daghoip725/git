import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import { getCategories } from '@/services/categories.service';
import { buildListingHref } from '@/utils/slug';

/** Nombre maximal d'annonces listées (limite d'un fichier sitemap unique). */
const MAX_LISTINGS = 5000;

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${siteUrl}/annonces`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${siteUrl}/categories`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/a-propos`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/contact`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/securite`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/conditions`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/confidentialite`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/cookies`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const categories = await getCategories();
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${siteUrl}/annonces?categorie=${category.slug}`,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select('slug, reference, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(MAX_LISTINGS);

  if (error) {
    logger.error('Génération du sitemap : annonces indisponibles', error);
    return [...staticRoutes, ...categoryRoutes];
  }

  const listingRoutes: MetadataRoute.Sitemap = (data ?? []).map((listing) => ({
    url: `${siteUrl}${buildListingHref(listing.slug, listing.reference)}`,
    lastModified: new Date(listing.updated_at),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  return [...staticRoutes, ...categoryRoutes, ...listingRoutes];
}
