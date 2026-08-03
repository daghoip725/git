/**
 * Cœur de la recherche d'annonces — **isomorphe**.
 *
 * Ce module ne dépend d'aucun contexte : ni `server-only`, ni client Supabase
 * particulier. C'est ce qui permet à la recherche de fonctionner des deux côtés
 * avec exactement les mêmes règles :
 *
 *  - le serveur rend la **première page** (référencement, et un résultat visible
 *    même sans JavaScript) ;
 *  - le navigateur enchaîne ensuite les recherches instantanées, sans repasser
 *    par le serveur Next.js — un aller-retour de moins sur une connexion mobile
 *    gabonaise, où c'est la latence qui coûte, pas le calcul.
 *
 * Dans les deux cas c'est la même RPC `search_ads` qui répond, sous RLS.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAdImageUrl } from '@/services/storage.service';
import type { AdCardData, AdFilters, Paginated } from '@/types';
import type { Database } from '@/types/database';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/utils/constants';

type Client = SupabaseClient<Database>;

/** Ligne renvoyée par `search_ads`. */
interface SearchRow {
  id: string;
  reference: string;
  title: string;
  slug: string;
  price: number | null;
  price_type: AdCardData['price_type'];
  city: string;
  district: string | null;
  is_featured: boolean;
  views_count: number;
  published_at: string | null;
  created_at: string;
  category_name: string | null;
  category_slug: string | null;
  cover_image_path: string | null;
  distance_km: number | null;
  total_count: number;
}

export function toCardData(row: SearchRow): AdCardData {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    slug: row.slug,
    price: row.price,
    price_type: row.price_type,
    city: row.city,
    district: row.district,
    is_featured: row.is_featured,
    published_at: row.published_at,
    created_at: row.created_at,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    coverImageUrl: getAdImageUrl(row.cover_image_path),
    distanceKm: row.distance_km,
  };
}

/**
 * Traduit les filtres applicatifs en arguments de la RPC.
 *
 * Le filtre géographique n'est transmis que **complet** : une latitude sans
 * rayon ne veut rien dire, et la base l'ignorerait de toute façon. Autant ne
 * pas l'envoyer.
 */
export function buildSearchArgs(filters: AdFilters, page: number, perPage: number) {
  const hasGeo =
    filters.latitude != null && filters.longitude != null && (filters.radiusKm ?? 0) > 0;

  return {
    p_query: filters.query ?? null,
    p_category_slug: filters.categorySlug ?? null,
    p_city: filters.city ?? null,
    p_province: filters.province ?? null,
    p_district: filters.district ?? null,
    p_min_price: filters.minPrice ?? null,
    p_max_price: filters.maxPrice ?? null,
    p_condition: filters.condition ?? null,
    p_price_type: filters.priceType ?? null,
    p_seller_id: filters.sellerId ?? null,
    p_featured_only: filters.featuredOnly ?? false,
    p_max_age_days: filters.maxAgeDays ?? null,
    p_latitude: hasGeo ? filters.latitude! : null,
    p_longitude: hasGeo ? filters.longitude! : null,
    p_radius_km: hasGeo ? filters.radiusKm! : null,
    // Une requête textuelle sans tri explicite bascule sur la pertinence.
    p_sort: filters.sort ?? (filters.query ? 'relevance' : 'recent'),
    p_limit: perPage,
    p_offset: (page - 1) * perPage,
  };
}

export interface RunSearchOptions {
  /** Permet d'abandonner une requête devenue obsolète (frappe au clavier). */
  signal?: AbortSignal;
}

/**
 * Exécute la recherche. Lève en cas d'erreur : c'est à l'appelant de décider
 * s'il journalise (serveur) ou s'il affiche un message (navigateur).
 */
export async function runSearch(
  client: Client,
  filters: AdFilters = {},
  options: RunSearchOptions = {},
): Promise<Paginated<AdCardData>> {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(filters.perPage ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  let request = client.rpc('search_ads', buildSearchArgs(filters, page, perPage));
  if (options.signal) request = request.abortSignal(options.signal);

  const { data, error } = await request.returns<SearchRow[]>();
  if (error) throw error;

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;

  return {
    items: rows.map(toCardData),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Quartiers réellement présents dans les annonces publiées d'une ville. */
export async function listDistricts(
  client: Client,
  city?: string | null,
): Promise<{ district: string; adsCount: number }[]> {
  const { data, error } = await client
    .rpc('list_districts', { p_city: city ?? null })
    .returns<{ district: string; ads_count: number }[]>();

  if (error) throw error;
  return (data ?? []).map((row) => ({ district: row.district, adsCount: row.ads_count }));
}
