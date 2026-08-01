import 'server-only';

/**
 * Lecture des annonces (Server Components uniquement).
 *
 * Toutes les requêtes passent par le client « anon » : la RLS garantit que seuls
 * les enregistrements autorisés sont renvoyés (annonces publiées pour le public,
 * intégralité de ses propres annonces pour un vendeur connecté).
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getCategoryIdsForSlug } from '@/services/categories.service';
import { getPublicImageUrl } from '@/services/storage.service';
import type { ListingCardData, ListingFilters, ListingWithRelations, Paginated } from '@/types';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/utils/constants';

/** Colonnes d'une annonce (on exclut `search_vector`, inutile côté client). */
const LISTING_COLUMNS = `
  id, reference, seller_id, category_id, title, slug, description,
  price, price_type, currency, condition, city, province, district,
  contact_phone, contact_whatsapp, allow_messages, status, is_featured,
  views_count, favorites_count, published_at, expires_at, rejection_reason,
  created_at, updated_at
`;

const LISTING_WITH_RELATIONS = `
  ${LISTING_COLUMNS},
  category:categories!listings_category_id_fkey(id, name, slug, icon),
  images:listing_images(id, listing_id, storage_path, position, width, height, created_at),
  seller:profiles!listings_seller_id_fkey(
    id, full_name, avatar_url, city, is_professional, is_verified, created_at
  )
`;

/** Version allégée pour les grilles : pas de description ni de contacts. */
const LISTING_CARD_COLUMNS = `
  id, title, slug, reference, price, price_type, city, is_featured,
  published_at, created_at, views_count,
  category:categories!listings_category_id_fkey(name, slug),
  images:listing_images(storage_path, position)
`;

interface RawCardRow {
  id: string;
  title: string;
  slug: string;
  reference: string;
  price: number | null;
  price_type: ListingCardData['price_type'];
  city: string;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  views_count: number;
  category: { name: string; slug: string } | null;
  images: { storage_path: string; position: number }[] | null;
}

/** Normalise une ligne PostgREST en donnée de carte prête à afficher. */
function toCardData(row: RawCardRow): ListingCardData & { reference: string } {
  const cover = [...(row.images ?? [])].sort((a, b) => a.position - b.position)[0];
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    reference: row.reference,
    price: row.price,
    price_type: row.price_type,
    city: row.city,
    is_featured: row.is_featured,
    published_at: row.published_at,
    created_at: row.created_at,
    category: row.category,
    coverImageUrl: getPublicImageUrl(cover?.storage_path),
  };
}

export type ListingCard = ReturnType<typeof toCardData>;

/**
 * Retire les diacritiques d'une recherche pour l'aligner sur `search_vector`,
 * qui est stocké désaccentué (voir `public.immutable_unaccent`).
 */
function normalizeSearchQuery(query: string): string {
  return query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s"-]/gu, ' ')
    .trim();
}

/**
 * Recherche paginée d'annonces.
 * Les filtres invalides sont ignorés silencieusement (la validation Zod a lieu
 * en amont, dans la page).
 */
export async function searchListings(
  filters: ListingFilters = {},
): Promise<Paginated<ListingCard>> {
  const supabase = await createClient();

  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(Math.max(1, filters.perPage ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const from = (page - 1) * perPage;

  let query = supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS, { count: 'exact' })
    .eq('status', 'published');

  if (filters.categorySlug) {
    const categoryIds = await getCategoryIdsForSlug(filters.categorySlug);
    if (categoryIds.length === 0) {
      return { items: [], total: 0, page, perPage, totalPages: 0 };
    }
    query = query.in('category_id', categoryIds);
  }

  if (filters.query) {
    const normalized = normalizeSearchQuery(filters.query);
    if (normalized) {
      query = query.textSearch('search_vector', normalized, {
        type: 'websearch',
        config: 'french',
      });
    }
  }

  if (filters.city) query = query.eq('city', filters.city);
  if (filters.province) query = query.eq('province', filters.province);
  if (filters.condition) query = query.eq('condition', filters.condition);
  if (filters.priceType) query = query.eq('price_type', filters.priceType);
  if (filters.sellerId) query = query.eq('seller_id', filters.sellerId);
  if (filters.featuredOnly) query = query.eq('is_featured', true);
  if (typeof filters.minPrice === 'number') query = query.gte('price', filters.minPrice);
  if (typeof filters.maxPrice === 'number') query = query.lte('price', filters.maxPrice);

  // Les annonces mises en avant remontent toujours en tête de page.
  query = query.order('is_featured', { ascending: false });

  switch (filters.sort) {
    case 'price_asc':
      query = query.order('price', { ascending: true, nullsFirst: false });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false, nullsFirst: false });
      break;
    case 'popular':
      query = query.order('views_count', { ascending: false });
      break;
    default:
      query = query.order('published_at', { ascending: false, nullsFirst: false });
  }

  const { data, error, count } = await query
    .range(from, from + perPage - 1)
    .returns<RawCardRow[]>();

  if (error) {
    logger.error('Recherche d’annonces impossible', error, { filters });
    return { items: [], total: 0, page, perPage, totalPages: 0 };
  }

  const total = count ?? 0;
  return {
    items: (data ?? []).map(toCardData),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Annonces mises en avant pour la page d'accueil. */
export async function getFeaturedListings(limit = 8): Promise<ListingCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .eq('status', 'published')
    .eq('is_featured', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<RawCardRow[]>();

  if (error) {
    logger.error('Chargement des annonces à la une impossible', error);
    return [];
  }
  return (data ?? []).map(toCardData);
}

/** Dernières annonces publiées. */
export async function getRecentListings(limit = 12): Promise<ListingCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<RawCardRow[]>();

  if (error) {
    logger.error('Chargement des annonces récentes impossible', error);
    return [];
  }
  return (data ?? []).map(toCardData);
}

interface RawListingRow extends Omit<ListingWithRelations, 'images'> {
  images: ListingWithRelations['images'] | null;
}

/**
 * Détail d'une annonce depuis sa référence publique (`/annonces/<slug>-<REF>`).
 * Renvoie `null` si l'annonce n'existe pas ou n'est pas visible par l'appelant.
 */
export async function getListingByReference(
  reference: string,
): Promise<ListingWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_WITH_RELATIONS)
    .eq('reference', reference.toUpperCase())
    .maybeSingle()
    .returns<RawListingRow | null>();

  if (error) {
    logger.error('Chargement de l’annonce impossible', error, { reference });
    return null;
  }
  if (!data) return null;

  return {
    ...data,
    images: [...(data.images ?? [])].sort((a, b) => a.position - b.position),
  };
}

/** Annonces d'un vendeur, tous statuts confondus (RLS : le vendeur lui-même). */
export async function getListingsBySeller(
  sellerId: string,
  options: { includeUnpublished?: boolean; limit?: number } = {},
): Promise<ListingCard[]> {
  const supabase = await createClient();

  let query = supabase.from('listings').select(LISTING_CARD_COLUMNS).eq('seller_id', sellerId);

  if (!options.includeUnpublished) query = query.eq('status', 'published');

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(options.limit ?? 100)
    .returns<RawCardRow[]>();

  if (error) {
    logger.error('Chargement des annonces du vendeur impossible', error, { sellerId });
    return [];
  }
  return (data ?? []).map(toCardData);
}

/** Annonces du même univers, hors annonce courante. */
export async function getRelatedListings(
  listing: Pick<ListingWithRelations, 'id' | 'category_id' | 'city'>,
  limit = 6,
): Promise<ListingCard[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .eq('status', 'published')
    .eq('category_id', listing.category_id)
    .neq('id', listing.id)
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
    .returns<RawCardRow[]>();

  if (error) {
    logger.error('Chargement des annonces similaires impossible', error);
    return [];
  }
  return (data ?? []).map(toCardData);
}

/** Annonces mises en favori par l'utilisateur connecté. */
export async function getFavoriteListings(userId: string): Promise<ListingCard[]> {
  const supabase = await createClient();

  const { data: favorites, error: favoritesError } = await supabase
    .from('favorites')
    .select('listing_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (favoritesError) {
    logger.error('Chargement des favoris impossible', favoritesError, { userId });
    return [];
  }

  const ids = (favorites ?? []).map((favorite) => favorite.listing_id);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_CARD_COLUMNS)
    .in('id', ids)
    .returns<RawCardRow[]>();

  if (error) {
    logger.error('Chargement des annonces favorites impossible', error, { userId });
    return [];
  }

  // Conserve l'ordre d'ajout aux favoris.
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toCardData(row)] : [];
  });
}

/** Identifiants des annonces déjà mises en favori (pour l'état initial des boutons). */
export async function getFavoriteListingIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from('favorites').select('listing_id').eq('user_id', userId);
  return new Set((data ?? []).map((favorite) => favorite.listing_id));
}

/** Villes ayant au moins une annonce publiée, pour alimenter les filtres. */
export async function getActiveCities(limit = 200): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select('city')
    .eq('status', 'published')
    .limit(limit);

  if (error) return [];
  return [...new Set((data ?? []).map((row) => row.city))].sort((a, b) => a.localeCompare(b, 'fr'));
}

/* -------------------------------------------------------------------------- */
/*  Espace vendeur                                                            */
/* -------------------------------------------------------------------------- */

/** Ligne d'annonce du tableau de bord vendeur (tous statuts). */
export interface SellerListingRow {
  id: string;
  title: string;
  slug: string;
  reference: string;
  price: number | null;
  price_type: ListingCardData['price_type'];
  status: ListingWithRelations['status'];
  views_count: number;
  favorites_count: number;
  created_at: string;
  coverImageUrl: string | null;
}

interface RawSellerRow extends Omit<SellerListingRow, 'coverImageUrl'> {
  images: { storage_path: string; position: number }[] | null;
}

const SELLER_LISTING_COLUMNS = `
  id, title, slug, reference, price, price_type, status,
  views_count, favorites_count, created_at,
  images:listing_images(storage_path, position)
`;

/**
 * Toutes les annonces de l'utilisateur, brouillons et annonces expirées incluses.
 * La RLS garantit qu'un vendeur ne voit que les siennes.
 */
export async function getMyListings(userId: string): Promise<SellerListingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(SELLER_LISTING_COLUMNS)
    .eq('seller_id', userId)
    .order('created_at', { ascending: false })
    .returns<RawSellerRow[]>();

  if (error) {
    logger.error('Chargement des annonces du compte impossible', error, { userId });
    return [];
  }

  return (data ?? []).map((row) => {
    const cover = [...(row.images ?? [])].sort((a, b) => a.position - b.position)[0];
    const { images: _images, ...rest } = row;
    return { ...rest, coverImageUrl: getPublicImageUrl(cover?.storage_path) };
  });
}

/**
 * Annonce complète depuis son identifiant, pour le formulaire de modification.
 * Retourne `null` si l'annonce n'existe pas ou n'appartient pas à l'appelant.
 */
export async function getOwnedListingById(
  listingId: string,
  userId: string,
): Promise<ListingWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('listings')
    .select(LISTING_WITH_RELATIONS)
    .eq('id', listingId)
    .eq('seller_id', userId)
    .maybeSingle()
    .returns<RawListingRow | null>();

  if (error) {
    logger.error('Chargement de l’annonce à modifier impossible', error, { listingId });
    return null;
  }
  if (!data) return null;

  return {
    ...data,
    images: [...(data.images ?? [])].sort((a, b) => a.position - b.position),
  };
}
