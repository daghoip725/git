/**
 * Types applicatifs partagés entre `services`, `components` et `app`.
 * Les types strictement « base de données » vivent dans `types/database.ts`.
 *
 * Correspondance de vocabulaire : la base parle d'`ads` (annonces) et d'`users`
 * (comptes) ; l'interface, en français, parle d'« annonces » et de « profils ».
 */
import type {
  AccountStatus,
  AdCondition,
  AdStatus,
  AuditAction,
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  PriceType,
  ReportReason,
  ReviewStatus,
  SubscriptionStatus,
  Tables,
  UserRole,
  VerificationStatus,
  Views,
} from '@/types/database';

/* -------------------------------------------------------------------------- */
/*  Entités                                                                   */
/* -------------------------------------------------------------------------- */

export type UserProfile = Tables<'users'>;
export type Category = Tables<'categories'>;
export type Ad = Tables<'ads'>;
export type AdImage = Tables<'ad_images'>;
export type Conversation = Tables<'conversations'>;
export type Message = Tables<'messages'>;
export type Notification = Tables<'notifications'>;
export type Review = Tables<'reviews'>;
export type Report = Tables<'reports'>;
export type SubscriptionPlan = Tables<'subscription_plans'>;
export type VerificationRequest = Tables<'verification_requests'>;
export type AuditLogEntry = Tables<'auth_audit_log'>;
export type Subscription = Tables<'subscriptions'>;
export type Payment = Tables<'payments'>;

export type AdListRow = Views<'ads_list_view'>;
export type ConversationRow = Views<'conversations_view'>;
export type PlatformStats = Views<'platform_stats'>;

export type {
  AccountStatus,
  AdCondition,
  AdStatus,
  AuditAction,
  NotificationType,
  PaymentProvider,
  PaymentStatus,
  PriceType,
  ReportReason,
  ReviewStatus,
  SubscriptionStatus,
  UserRole,
  VerificationStatus,
};

/* -------------------------------------------------------------------------- */
/*  Vues métier                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Vendeur tel qu'exposé publiquement.
 * Ne contient que des colonnes réellement accordées en lecture publique :
 * ni `phone`, ni `whatsapp`, ni `district`.
 */
export interface PublicSeller {
  id: string;
  full_name: string;
  avatar_path: string | null;
  city: string | null;
  is_professional: boolean;
  is_verified: boolean;
  business_name: string | null;
  rating_average: number;
  rating_count: number;
  ads_count: number;
  created_at: string;
}

/** Annonce enrichie de ses relations, telle que renvoyée par le service. */
export interface AdWithRelations extends Ad {
  category: Pick<Category, 'id' | 'name' | 'slug' | 'icon'> | null;
  images: AdImage[];
  seller: PublicSeller | null;
}

/** Donnée minimale d'une carte d'annonce (grilles, carrousels). */
export interface AdCardData {
  id: string;
  reference: string;
  title: string;
  slug: string;
  price: number | null;
  price_type: PriceType;
  city: string;
  is_featured: boolean;
  published_at: string | null;
  created_at: string;
  categoryName: string | null;
  categorySlug: string | null;
  coverImageUrl: string | null;
}

/** Ligne du tableau de bord vendeur (tous statuts confondus). */
export interface SellerAdRow {
  id: string;
  reference: string;
  title: string;
  slug: string;
  price: number | null;
  price_type: PriceType;
  status: AdStatus;
  views_count: number;
  favorites_count: number;
  messages_count: number;
  created_at: string;
  coverImageUrl: string | null;
}

/** Conversation prête à afficher. */
export interface ConversationSummary {
  id: string;
  adId: string;
  adTitle: string;
  adSlug: string;
  adReference: string;
  adImageUrl: string | null;
  correspondentId: string;
  correspondentName: string;
  correspondentAvatarUrl: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** `true` si l'utilisateur courant est le vendeur de l'annonce. */
  isSeller: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Recherche                                                                 */
/* -------------------------------------------------------------------------- */

export type AdSort = 'recent' | 'relevance' | 'price_asc' | 'price_desc' | 'popular';

/** Critères acceptés par `/annonces`. */
export interface AdFilters {
  query?: string;
  categorySlug?: string;
  city?: string;
  province?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: AdCondition;
  priceType?: PriceType;
  featuredOnly?: boolean;
  sellerId?: string;
  sort?: AdSort;
  page?: number;
  perPage?: number;
}

/** Enveloppe de pagination renvoyée par les services de listage. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/* -------------------------------------------------------------------------- */
/*  Divers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Résultat normalisé d'une Server Action.
 * `fieldErrors` reprend la forme aplatie de Zod, pour un affichage direct.
 */
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

/** Catégorie augmentée de son nombre d'annonces (compteur dénormalisé). */
export interface CategoryWithCount extends Category {
  listingsCount: number;
}

/** Option générique pour les `<select>` et groupes de filtres. */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}
