import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/env';

/** Directives d'exploration : l'espace privé et les routes techniques sont exclus. */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/compte/', '/messages/', '/auth/', '/api/', '/annonces/nouvelle'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
