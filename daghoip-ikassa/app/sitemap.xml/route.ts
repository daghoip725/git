/**
 * Index des plans du site.
 *
 * Next.js sert `/sitemap/0.xml`, `/sitemap/1.xml`… quand `app/sitemap.ts`
 * exporte `generateSitemaps()`, mais **ne produit aucun index** qui les
 * référence. Or `robots.txt` pointe vers `/sitemap.xml`, comme il se doit :
 * sans ce fichier, Google y trouvait une page 404 et le plan entier restait
 * lettre morte.
 *
 * Le défaut était silencieux — le build affichait bien trois sitemaps générés,
 * et rien n'indiquait que l'adresse déclarée n'existait pas. Il n'est apparu
 * qu'en interrogeant réellement l'URL.
 */
import { getSiteUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createPublicClient } from '@/lib/supabase/public';
import { PER_SITEMAP, MAX_LISTINGS } from '@/app/sitemap';

/** Même cadence de revalidation que les plans qu'il référence. */
export const revalidate = 3600;

/**
 * Compte les fichiers à référencer.
 *
 * Duplique volontairement le découpage de `app/sitemap.ts` à partir des mêmes
 * constantes exportées : partager la fonction imposerait d'exporter une entrée
 * supplémentaire depuis un module de métadonnées Next, ce que le convention de
 * fichier n'autorise pas proprement.
 */
async function countSitemaps(): Promise<number> {
  const supabase = createPublicClient();

  const [{ count: adCount }, { count: sellerCount }] = await Promise.all([
    supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('users').select('id', { count: 'exact', head: true }).gt('ads_count', 0),
  ]);

  const adPages = Math.ceil(Math.min(adCount ?? 0, MAX_LISTINGS) / PER_SITEMAP);
  const sellerPages = Math.ceil((sellerCount ?? 0) / PER_SITEMAP);

  return 1 + Math.max(adPages, 1) + Math.max(sellerPages, 1);
}

export async function GET(): Promise<Response> {
  const siteUrl = getSiteUrl();

  let total = 3;
  try {
    total = await countSitemaps();
  } catch (error) {
    // Base injoignable : on référence tout de même le fichier des pages fixes,
    // qui ne dépend d'aucune donnée. Un index partiel vaut mieux qu'une erreur.
    logger.error('Index du plan du site : comptage impossible', error);
    total = 1;
  }

  const lastModified = new Date().toISOString();
  const entries = Array.from(
    { length: total },
    (_, id) =>
      `<sitemap><loc>${siteUrl}/sitemap/${id}.xml</loc><lastmod>${lastModified}</lastmod></sitemap>`,
  ).join('');

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</sitemapindex>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      // Une heure, comme les plans référencés : un robot qui revient plus tôt
      // n'apprendrait rien de neuf.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
