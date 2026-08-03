import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createPublicClient } from '@/lib/supabase/public';
import { getCategories } from '@/services/categories.service';
import { GABON_CITY_NAMES } from '@/utils/constants';
import { buildListingHref } from '@/utils/slug';

/**
 * Plan du site, découpé en plusieurs fichiers.
 *
 * Un sitemap unique est plafonné par le protocole à 50 000 URL et 50 Mo. La
 * version précédente s'arrêtait à 5 000 annonces, ce qui suffit au démarrage
 * mais fait disparaître le reste du catalogue dès que la plateforme prend. Le
 * découpage repousse cette limite sans qu'on ait à y revenir.
 *
 * Next.js génère alors `/sitemap/0.xml`, `/sitemap/1.xml`… et l'index qui les
 * référence. `robots.txt` continue de pointer vers `/sitemap.xml`, qui **est**
 * cet index : rien à changer côté déclaration dans la Search Console.
 */

/** Marge sous la limite du protocole (50 000) : on ne joue pas avec le plafond.
 *  Exporté : l'index `/sitemap.xml` doit compter les fichiers de la même façon. */
export const PER_SITEMAP = 20_000;

/** Au-delà, ce sont des annonces que plus personne ne cherche. */
export const MAX_LISTINGS = 100_000;

export const revalidate = 3600;

/**
 * Découpage.
 *
 * Le fichier `0` porte les pages fixes et les pages de catégorie et de ville :
 * peu nombreuses, elles doivent être explorées en priorité et ne pas se
 * retrouver noyées derrière des milliers d'annonces. Les suivants portent les
 * annonces, puis les profils vendeurs.
 */
export async function generateSitemaps(): Promise<{ id: number }[]> {
  // Client sans session : cette fonction s'exécute au build, hors requête.
  const supabase = createPublicClient();

  const [{ count: adCount }, { count: sellerCount }] = await Promise.all([
    supabase.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('users').select('id', { count: 'exact', head: true }).gt('ads_count', 0),
  ]);

  const adPages = Math.ceil(Math.min(adCount ?? 0, MAX_LISTINGS) / PER_SITEMAP);
  const sellerPages = Math.ceil((sellerCount ?? 0) / PER_SITEMAP);

  // Au moins deux fichiers, même sur une base vide : un index qui ne
  // référencerait rien serait rejeté par la Search Console.
  const total = 1 + Math.max(adPages, 1) + Math.max(sellerPages, 1);
  return Array.from({ length: total }, (_, id) => ({ id }));
}

export default async function sitemap({
  id,
}: {
  id: number | string;
}): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  /*
   * `id` arrive en **chaîne** à l'exécution, quoi qu'en dise le typage : il
   * vient du segment d'URL `/sitemap/0.xml`. Une comparaison stricte à `0`
   * échouait donc en silence, et le fichier des pages fixes partait chercher
   * des annonces sur une plage négative — sitemap vide, pages d'accueil et de
   * catégorie absentes du plan. Le journal de build l'a montré (`page: -1`).
   */
  const index = Number(id);
  if (!Number.isInteger(index) || index < 0) return [];

  if (index === 0) return staticSitemap(siteUrl);

  const adPages = await countPages('ads');
  return index <= adPages
    ? listingSitemap(siteUrl, index - 1)
    : sellerSitemap(siteUrl, index - adPages - 1);
}

/** Nombre de fichiers consacrés à une ressource. */
async function countPages(resource: 'ads'): Promise<number> {
  const supabase = createPublicClient();
  const { count } = await supabase
    .from(resource)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published');

  return Math.max(Math.ceil(Math.min(count ?? 0, MAX_LISTINGS) / PER_SITEMAP), 1);
}

/* -------------------------------------------------------------------------- */
/*  Fichier 0 : pages fixes, catégories, villes                               */
/* -------------------------------------------------------------------------- */

async function staticSitemap(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  const routes: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: 'hourly', priority: 1 },
    { url: `${siteUrl}/annonces`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${siteUrl}/categories`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${siteUrl}/premium`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/a-propos`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/contact`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${siteUrl}/securite`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${siteUrl}/conditions`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/confidentialite`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${siteUrl}/cookies`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  const categories = await getCategories();
  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${siteUrl}/annonces?categorie=${encodeURIComponent(category.slug)}`,
    changeFrequency: 'daily',
    priority: 0.6,
  }));

  /*
   * Pages par ville. « Voiture Port-Gentil » est exactement ce qui se tape dans
   * Google au Gabon ; sans ces URL, seule la page nationale peut y répondre, et
   * elle est bien moins pertinente. Elles portent la même canonique que le
   * filtre correspondant, donc aucun contenu dupliqué.
   */
  const cityRoutes: MetadataRoute.Sitemap = GABON_CITY_NAMES.map((city) => ({
    url: `${siteUrl}/annonces?ville=${encodeURIComponent(city)}`,
    changeFrequency: 'daily',
    priority: 0.5,
  }));

  return [...routes, ...categoryRoutes, ...cityRoutes];
}

/* -------------------------------------------------------------------------- */
/*  Fichiers suivants : annonces, puis vendeurs                               */
/* -------------------------------------------------------------------------- */

async function listingSitemap(siteUrl: string, page: number): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();
  const from = page * PER_SITEMAP;

  const { data, error } = await supabase
    .from('ads')
    .select('slug, reference, updated_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .range(from, from + PER_SITEMAP - 1);

  if (error) {
    // Un sitemap vide vaut mieux qu'une page en erreur : Google réessaiera, et
    // les fichiers déjà connus restent valides.
    logger.error('Génération du sitemap : annonces indisponibles', error, { page });
    return [];
  }

  return (data ?? []).map((ad) => ({
    url: `${siteUrl}${buildListingHref(ad.slug, ad.reference)}`,
    lastModified: new Date(ad.updated_at),
    changeFrequency: 'daily',
    priority: 0.8,
  }));
}

/**
 * Profils vendeurs.
 *
 * Absents du plan jusqu'ici, alors qu'un commerçant qui publie régulièrement a
 * une page qui mérite d'être trouvée sur son nom. Seuls les comptes ayant au
 * moins une annonce y figurent : un profil vide n'est pas un résultat de
 * recherche utile, et l'indexer dilue le site.
 */
async function sellerSitemap(siteUrl: string, page: number): Promise<MetadataRoute.Sitemap> {
  const supabase = createPublicClient();
  const from = page * PER_SITEMAP;

  const { data, error } = await supabase
    .from('users')
    .select('id, updated_at')
    .gt('ads_count', 0)
    .eq('status', 'active')
    .order('ads_count', { ascending: false })
    .range(from, from + PER_SITEMAP - 1);

  if (error) {
    logger.error('Génération du sitemap : vendeurs indisponibles', error, { page });
    return [];
  }

  return (data ?? []).map((seller) => ({
    url: `${siteUrl}/vendeurs/${seller.id}`,
    lastModified: new Date(seller.updated_at),
    changeFrequency: 'weekly',
    priority: 0.4,
  }));
}
