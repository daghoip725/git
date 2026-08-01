import type { MetadataRoute } from 'next';

import { BRAND_COLORS, SITE } from '@/utils/constants';

/** Manifeste PWA : permet l'ajout à l'écran d'accueil sur mobile. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/',
    display: 'standalone',
    background_color: BRAND_COLORS.white,
    theme_color: BRAND_COLORS.primary,
    lang: 'fr',
    categories: ['shopping', 'business'],
    icons: [
      { src: SITE.logo, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: SITE.logo, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
