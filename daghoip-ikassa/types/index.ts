/**
 * Types applicatifs partagés entre les couches `services`, `components` et `app`.
 * Les types purement « base de données » vivent dans `types/database.ts`.
 */
import type {
  ListingCondition,
  ListingStatus,
  PriceType,
  Tables,
  UserRole,
} from '@/types/database';

export type Profile = Tables<'profiles'>;
export type Category = Tables<'categories'>;
export type Listing = Tables<'listings'>;
export type ListingImage = Tables<'listing_images'>;
export type Message = Tables<'messages'>;

export type { ListingCondition, ListingStatus, PriceType, UserRole };

/** Vendeur tel qu'exposé publiquement sur une annonce (données non sensibles). */
export interface PublicSeller {
  id: string;
  full_name: string;
  avatar_url: string | null;
  city: string | null;
  is_professional: boolean;
  is_verified: boolean;
  created_at: string;
}

/** Annonce enrichie de ses relations, telle que renvoyée par le service. */
export interface ListingWithRelations extends Listing {
  category: Pick<Category, 'id' | 'name' | 'slug' | 'icon'> | null;
  images: ListingImage[];
  seller: PublicSeller | null;
}

/** Version allégée utilisée dans les grilles et carrousels. */
export interface ListingCardData {
  id: string;
  title: string;
  slug: string;
  price: number | null;
  price_type: PriceType;
  city: string;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  category: Pick<Category, 'name' | 'slug'> | null;
  coverImageUrl: string | null;
}

/** Critères de recherche acceptés par `/annonces`. */
export interface ListingFilters {
  query?: string;
  categorySlug?: string;
  city?: string;
  province?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: ListingCondition;
  priceType?: PriceType;
  featuredOnly?: boolean;
  sellerId?: string;
  sort?: ListingSort;
  page?: number;
  perPage?: number;
}

export type ListingSort = 'recent' | 'price_asc' | 'price_desc' | 'popular';

/** Enveloppe de pagination renvoyée par les services de listing. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Résultat normalisé d'une Server Action.
 * `fieldErrors` reprend la forme aplatie de Zod pour un affichage direct.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };

/** Catégorie augmentée du nombre d'annonces publiées. */
export interface CategoryWithCount extends Category {
  listingsCount: number;
}

/** Option générique pour les `<select>` et groupes de filtres. */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}
