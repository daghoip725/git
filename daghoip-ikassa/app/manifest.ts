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
    dir: 'ltr',
    orientation: 'portrait-primary',
    scope: '/',
    categories: ['shopping', 'business'],
    /*
     * Raccourcis de l'icône installée : les trois gestes qui amènent quelqu'un
     * à ouvrir l'application depuis son écran d'accueil. Déposer une annonce
     * vient en premier — c'est l'action qui a le plus de valeur et celle qui
     * demande le plus d'étapes si on doit la chercher.
     */
    shortcuts: [
      {
        name: 'Déposer une annonce',
        short_name: 'Déposer',
        url: '/annonces/nouvelle',
        description: 'Publier un article à vendre',
      },
      {
        name: 'Mes messages',
        short_name: 'Messages',
        url: '/messages',
        description: 'Reprendre une conversation',
      },
      {
        name: 'Mes annonces',
        short_name: 'Annonces',
        url: '/compte/annonces',
        description: 'Gérer mes publications',
      },
    ],
    icons: [
      { src: SITE.logo, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: SITE.logo, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
