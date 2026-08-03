import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/env';

/**
 * Directives d'exploration.
 *
 * `robots.txt` et les balises `robots` des pages ne font pas le même travail,
 * et il faut les deux :
 *
 *  - la **balise** empêche l'indexation d'une page que le robot a déjà chargée ;
 *  - le **fichier** empêche de la charger, donc préserve le budget
 *    d'exploration — la part de temps que Google accorde au site. Chaque page
 *    d'administration parcourue est une annonce qui ne l'est pas.
 *
 * Une règle ici n'est cependant **pas une protection** : `robots.txt` est
 * public, et lu en priorité par ceux qui cherchent quoi attaquer. Ce qui
 * protège l'administration, c'est `requireRole()` et la RLS PostgreSQL.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Espace privé : rien d'indexable, et beaucoup de pages.
          '/compte/',
          '/messages/',
          // Administration : absente de cette liste jusqu'ici, alors que c'est
          // la section qui consomme le plus de budget pour aucun bénéfice.
          '/admin/',
          // Routes techniques : ni contenu, ni intérêt pour un moteur.
          '/auth/',
          '/api/',
          '/annonces/nouvelle',
          // Repli hors connexion : il n'a de sens que servi par le service
          // worker. Indexé, il ferait un très mauvais résultat de recherche.
          '/hors-ligne',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
