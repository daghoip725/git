import 'server-only';

/**
 * Lecture des annonces (Server Components uniquement).
 *
 * Deux chemins d'accès complémentaires :
 *  - la RPC `search_ads` pour la recherche filtrée : filtres, tri, pagination,
 *    image de couverture et total de résultats sont calculés en une seule
 *    requête côté PostgreSQL ;
 *  - la vue `ads_list_view` (catégorie + couverture pré-jointes) pour les
 *    listages simples.
 *
 * Dans les deux cas la RLS s'applique à l'appelant : la RPC et la vue sont
 * déclarées `security invoker`.
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { runSearch } from '@/services/ads.search';
import { getAdImageUrl } from '@/services/storage.service';
import type { AdCardData, AdFilters, AdWithRelations, Paginated, SellerAdRow } from '@/types';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/utils/constants';

/* -------------------------------------------------------------------------- */
/*  Recherche                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Recherche paginée, côté serveur.
 *
 * La logique vit dans `services/ads.search.ts`, partagée avec la recherche
 * instantanée du navigateur : un seul jeu de règles, une seule RPC. Ici on
 * n'ajoute que ce qui est propre au serveur — le client authentifié par cookie
 * et la journalisation d'un échec, invisible pour le visiteur.
 */
export async function searchAds(filters: AdFilters = {}): Promise<Paginated<AdCardData>> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(Math.max(1, filters.perPage ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

  try {
    return await runSearch(supabase, { ...filters, page, perPage });
  } catch (error) {
    logger.error('Recherche d’annonces impossible', error, { filters });
    return { items: [], total: 0, page, perPage, totalPages: 0 };
  }
}

/** Suggestions d'autocomplétion (recherche approximative sur le titre). */
export async function suggestAds(query: string, limit = 8) {
  if (query.trim().length < 2) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('suggest_ads', {
    p_query: query.trim(),
    p_limit: limit,
  });

  if (error) {
    logger.error('Suggestions indisponibles', error);
    return [];
  }
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/*  Listages simples (vue pré-jointe)                                         */
/* -------------------------------------------------------------------------- */

const LIST_COLUMNS =
  'id, reference, title, slug, price, price_type, city, is_featured, ' +
  'published_at, created_at, category_name, category_slug, cover_image_path';

interface ListViewRow {
  id: string;
  reference: string;
  title: string;
  slug: string;
  price: number | null;
  price_type: AdCardData['price_type'];
  city: string;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  category_name: string | null;
  category_slug: string | null;
  cover_image_path: string | null;
}

function fromListView(row: ListViewRow): AdCardData {
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    slug: row.slug,
    price: row.price,
    price_type: row.price_type,
    city: row.city,
    is_featured: row.is_featured,
    published_at: row.published_at,
    created_at: row.created_at,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    coverImageUrl: getAdImageUrl(row.cover_image_path),
  };
}

/** Annonces mises en avant (page d'accueil). */
export async function getFeaturedAds(limit = 8): Promise<AdCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ads_list_view')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .eq('is_featured', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<ListViewRow[]>();

  if (error) {
    logger.error('Chargement des annonces à la une impossible', error);
    return [];
  }
  return (data ?? []).map(fromListView);
}

/** Dernières annonces publiées. */
export async function getRecentAds(limit = 12): Promise<AdCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ads_list_view')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<ListViewRow[]>();

  if (error) {
    logger.error('Chargement des annonces récentes impossible', error);
    return [];
  }
  return (data ?? []).map(fromListView);
}

/**
 * Annonces les plus consultées.
 *
 * Le tri s'appuie sur `views_count`, servi par l'index partiel `ads_popular_idx`
 * (limité aux annonces publiées) : aucun tri en mémoire.
 */
export async function getPopularAds(limit = 8): Promise<AdCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ads_list_view')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .order('views_count', { ascending: false })
    .limit(limit)
    .returns<ListViewRow[]>();

  if (error) {
    logger.error('Chargement des annonces populaires impossible', error);
    return [];
  }
  return (data ?? []).map(fromListView);
}

/**
 * Annonces du même univers, hors annonce courante.
 *
 * Deux passes, dans cet ordre de pertinence :
 *  1. même catégorie **et même ville** — c'est ce qu'un acheteur compare
 *     vraiment, puisqu'il ne traversera pas le pays pour un canapé ;
 *  2. même catégorie, toutes villes, pour compléter si la première ne suffit
 *     pas. Dans une catégorie peu fournie à Koulamoutou, la première passe
 *     renverrait sinon une section vide.
 */
export async function getRelatedAds(
  ad: Pick<AdWithRelations, 'id' | 'category_id' | 'city'>,
  limit = 6,
): Promise<AdCardData[]> {
  const supabase = await createClient();

  const query = (sameCity: boolean) => {
    const builder = supabase
      .from('ads_list_view')
      .select(LIST_COLUMNS)
      .eq('status', 'published')
      .eq('category_id', ad.category_id)
      .neq('id', ad.id);

    return (sameCity ? builder.eq('city', ad.city) : builder)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit)
      .returns<ListViewRow[]>();
  };

  const { data: local, error } = await query(true);
  if (error) {
    logger.error('Chargement des annonces similaires impossible', error);
    return [];
  }

  const rows = local ?? [];
  if (rows.length >= limit) return rows.map(fromListView);

  const { data: elsewhere } = await query(false);
  const seen = new Set(rows.map((row) => row.id));
  const completed = [...rows];

  for (const row of elsewhere ?? []) {
    if (completed.length >= limit) break;
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    completed.push(row);
  }

  return completed.map(fromListView);
}

/* -------------------------------------------------------------------------- */
/*  Détail                                                                    */
/* -------------------------------------------------------------------------- */

const AD_WITH_RELATIONS = `
  id, reference, seller_id, category_id, title, slug, description,
  price, price_type, currency, condition, city, province, district,
  latitude, longitude, contact_phone, contact_whatsapp, allow_messages,
  status, is_featured, featured_until, views_count, favorites_count,
  messages_count, published_at, expires_at, sold_at, rejection_reason,
  created_at, updated_at,
  category:categories!ads_category_id_fkey(id, name, slug, icon),
  images:ad_images(id, ad_id, storage_path, position, width, height, byte_size, created_at),
  seller:users!ads_seller_id_fkey(
    id, full_name, avatar_path, city, is_professional, is_verified,
    business_name, rating_average, rating_count, ads_count, created_at
  )
`;

interface RawAdRow extends Omit<AdWithRelations, 'images'> {
  images: AdWithRelations['images'] | null;
}

/**
 * Détail d'une annonce depuis sa référence publique (`/annonces/<slug>-<REF>`).
 * Renvoie `null` si l'annonce n'existe pas ou n'est pas visible par l'appelant.
 */
export async function getAdByReference(reference: string): Promise<AdWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ads')
    .select(AD_WITH_RELATIONS)
    .eq('reference', reference.toUpperCase())
    .maybeSingle()
    .returns<RawAdRow | null>();

  if (error) {
    logger.error('Chargement de l’annonce impossible', error, { reference });
    return null;
  }
  if (!data) return null;

  return { ...data, images: [...(data.images ?? [])].sort((a, b) => a.position - b.position) };
}

/**
 * Annonce complète depuis son identifiant, pour le formulaire de modification.
 * Renvoie `null` si elle n'appartient pas à l'appelant.
 */
export async function getOwnedAdById(
  adId: string,
  userId: string,
): Promise<AdWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ads')
    .select(AD_WITH_RELATIONS)
    .eq('id', adId)
    .eq('seller_id', userId)
    .maybeSingle()
    .returns<RawAdRow | null>();

  if (error) {
    logger.error('Chargement de l’annonce à modifier impossible', error, { adId });
    return null;
  }
  if (!data) return null;

  return { ...data, images: [...(data.images ?? [])].sort((a, b) => a.position - b.position) };
}

/* -------------------------------------------------------------------------- */
/*  Espace vendeur                                                            */
/* -------------------------------------------------------------------------- */

interface SellerViewRow extends ListViewRow {
  status: SellerAdRow['status'];
  views_count: number;
  favorites_count: number;
}

/** Toutes les annonces de l'utilisateur, brouillons et expirées incluses. */
export async function getMyAds(userId: string): Promise<SellerAdRow[]> {
  const supabase = await createClient();

  /*
   * Deux requêtes plutôt qu'une colonne de plus dans `ads_list_view` : cette
   * vue sert aussi les grilles publiques, et le nombre de contacts n'a aucune
   * raison d'y voyager pour tous les visiteurs. La seconde requête ne remonte
   * que deux colonnes, sur les seules annonces du compte, et la RLS s'y
   * applique comme partout.
   */
  const [listResult, contactsResult] = await Promise.all([
    supabase
      .from('ads_list_view')
      .select(`${LIST_COLUMNS}, status, views_count, favorites_count`)
      .eq('seller_id', userId)
      .order('created_at', { ascending: false })
      .returns<SellerViewRow[]>(),
    supabase.from('ads').select('id, contacts_count').eq('seller_id', userId),
  ]);

  const { data, error } = listResult;
  if (error) {
    logger.error('Chargement des annonces du compte impossible', error, { userId });
    return [];
  }

  if (contactsResult.error) {
    // Les annonces s'affichent sans leur nombre de contacts : une statistique
    // manquante ne doit pas vider la page.
    logger.warn('Nombre de contacts indisponible', { error: contactsResult.error.message });
  }

  const contactsById = new Map(
    (contactsResult.data ?? []).map((row) => [row.id, row.contacts_count]),
  );

  return (data ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    title: row.title,
    slug: row.slug,
    price: row.price,
    price_type: row.price_type,
    status: row.status,
    views_count: row.views_count,
    favorites_count: row.favorites_count,
    contacts_count: contactsById.get(row.id) ?? 0,
    messages_count: 0,
    created_at: row.created_at,
    coverImageUrl: getAdImageUrl(row.cover_image_path),
  }));
}

/** Annonces publiées d'un vendeur donné. */
export async function getAdsBySeller(sellerId: string, limit = 24): Promise<AdCardData[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ads_list_view')
    .select(LIST_COLUMNS)
    .eq('seller_id', sellerId)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<ListViewRow[]>();

  if (error) {
    logger.error('Chargement des annonces du vendeur impossible', error, { sellerId });
    return [];
  }
  return (data ?? []).map(fromListView);
}

/** Quota d'annonces en ligne accordé par l'offre de l'utilisateur. */
export async function getAdQuota(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ad_quota', { p_user_id: userId });

  if (error) {
    logger.error('Lecture du quota impossible', error, { userId });
    return 0;
  }
  return data ?? 0;
}

/* -------------------------------------------------------------------------- */
/*  Favoris                                                                   */
/* -------------------------------------------------------------------------- */

/** Annonces mises en favori, plus récentes d'abord. */
export async function getFavoriteAds(userId: string): Promise<AdCardData[]> {
  const supabase = await createClient();

  const { data: favorites, error: favoritesError } = await supabase
    .from('favorites')
    .select('ad_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (favoritesError) {
    logger.error('Chargement des favoris impossible', favoritesError, { userId });
    return [];
  }

  const ids = (favorites ?? []).map((favorite) => favorite.ad_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('ads_list_view')
    .select(LIST_COLUMNS)
    .in('id', ids)
    .returns<ListViewRow[]>();

  if (error) {
    logger.error('Chargement des annonces favorites impossible', error, { userId });
    return [];
  }

  // Conserve l'ordre d'ajout aux favoris.
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [fromListView(row)] : [];
  });
}

/** Identifiants des annonces déjà en favori (état initial des boutons cœur). */
export async function getFavoriteAdIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from('favorites').select('ad_id').eq('user_id', userId);
  return new Set((data ?? []).map((favorite) => favorite.ad_id));
}

/* -------------------------------------------------------------------------- */
/*  Statistiques                                                              */
/* -------------------------------------------------------------------------- */

/** Statistiques globales (vue matérialisée, rafraîchie toutes les 15 minutes). */
export async function getPlatformStats() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('platform_stats').select('*').maybeSingle();

  if (error) {
    logger.error('Chargement des statistiques impossible', error);
    return null;
  }
  return data;
}

/**
 * Annonces recommandées pour l'utilisateur courant.
 *
 * Le calcul vit en base (`recommend_ads`) : croiser les favoris, les catégories
 * et les gammes de prix en JavaScript demanderait de rapatrier des lignes que la
 * RLS ne laisse de toute façon pas sortir.
 *
 * `reason` dit sur quoi repose la liste — `affinite` quand l'utilisateur a des
 * favoris, `populaire` sinon. La page peut ainsi titrer honnêtement plutôt que
 * d'annoncer « pour vous » à quelqu'un dont on ne sait rien.
 */
export async function getRecommendedAds(
  limit = 8,
): Promise<{ ads: AdCardData[]; reason: 'affinite' | 'populaire' }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('recommend_ads', { p_limit: limit });

  if (error) {
    logger.error('Chargement des recommandations impossible', error);
    return { ads: [], reason: 'populaire' };
  }

  const rows = data ?? [];
  return {
    ads: rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      title: row.title,
      slug: row.slug,
      price: row.price,
      price_type: row.price_type,
      city: row.city,
      is_featured: row.is_featured,
      published_at: row.published_at,
      created_at: row.created_at,
      categoryName: row.category_name,
      categorySlug: row.category_slug,
      coverImageUrl: getAdImageUrl(row.cover_image_path),
    })),
    reason: rows[0]?.reason ?? 'populaire',
  };
}

/**
 * Annonces consultées récemment par l'utilisateur courant.
 *
 * `recent_ad_views()` est `security invoker` : la RLS de `ad_views` **et** celle
 * de `ads` s'appliquent. Une annonce retirée depuis la visite disparaît donc
 * d'elle-même — on ne renvoie personne vers une annonce qui n'existe plus.
 */
export async function getRecentlyViewedAds(
  limit = 24,
): Promise<(AdCardData & { viewedAt: string; viewCount: number })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('recent_ad_views', { p_limit: limit });

  if (error) {
    logger.error('Chargement de l’historique de consultation impossible', error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    reference: row.reference,
    title: row.title,
    slug: row.slug,
    price: row.price,
    price_type: row.price_type,
    city: row.city,
    is_featured: row.is_featured,
    published_at: row.published_at,
    created_at: row.created_at,
    categoryName: row.category_name,
    categorySlug: row.category_slug,
    coverImageUrl: getAdImageUrl(row.cover_image_path),
    viewedAt: row.viewed_at,
    viewCount: row.view_count,
  }));
}

/** Recherches récentes de l'utilisateur courant. */
export async function getRecentSearches(limit = 10) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('recent_searches', { p_limit: limit });

  if (error) {
    logger.error('Chargement de l’historique de recherche impossible', error);
    return [];
  }
  return data ?? [];
}
