/**
 * Constantes métier et de configuration de l'application.
 * Tout ce qui est spécifique au marché gabonais (villes, provinces, monnaie,
 * indicatif téléphonique) est centralisé ici.
 */
import type { AdCondition, AdSort, AdStatus, PriceType } from '@/types';

/** Identité du site, réutilisée par les métadonnées et le footer. */
export const SITE = {
  name: 'Daghoip Ikassa',
  tagline: 'Les petites annonces du Gabon',
  description:
    'Daghoip Ikassa est la plateforme de petites annonces du Gabon : achetez, vendez et échangez en toute confiance à Libreville, Port-Gentil, Franceville et partout au Gabon.',
  locale: 'fr-GA',
  country: 'GA',
  logo: '/logo-daghoip-ikassa.png',
  supportEmail: 'contact@daghoip-ikassa.ga',
  url: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
} as const;

/** Palette officielle de la marque (source de vérité pour le SQL, les mails, etc.). */
export const BRAND_COLORS = {
  primary: '#095032',
  secondary: '#216548',
  gold: '#C89F4A',
  white: '#FCFCFC',
} as const;

/** Monnaie officielle : franc CFA d'Afrique centrale, sans décimales. */
export const CURRENCY = {
  code: 'XAF',
  symbol: 'FCFA',
  decimals: 0,
} as const;

/** Indicatif téléphonique international du Gabon. */
export const GABON_DIAL_CODE = '+241';

/** Les neuf provinces du Gabon. */
export const GABON_PROVINCES = [
  'Estuaire',
  'Haut-Ogooué',
  'Moyen-Ogooué',
  'Ngounié',
  'Nyanga',
  'Ogooué-Ivindo',
  'Ogooué-Lolo',
  'Ogooué-Maritime',
  'Woleu-Ntem',
] as const;

export type GabonProvince = (typeof GABON_PROVINCES)[number];

/** Principales villes gabonaises, rattachées à leur province. */
export const GABON_CITIES: ReadonlyArray<{ name: string; province: GabonProvince }> = [
  { name: 'Libreville', province: 'Estuaire' },
  { name: 'Akanda', province: 'Estuaire' },
  { name: 'Owendo', province: 'Estuaire' },
  { name: 'Ntoum', province: 'Estuaire' },
  { name: 'Kango', province: 'Estuaire' },
  { name: 'Cocobeach', province: 'Estuaire' },
  { name: 'Port-Gentil', province: 'Ogooué-Maritime' },
  { name: 'Gamba', province: 'Ogooué-Maritime' },
  { name: 'Omboué', province: 'Ogooué-Maritime' },
  { name: 'Franceville', province: 'Haut-Ogooué' },
  { name: 'Moanda', province: 'Haut-Ogooué' },
  { name: 'Mounana', province: 'Haut-Ogooué' },
  { name: 'Okondja', province: 'Haut-Ogooué' },
  { name: 'Léconi', province: 'Haut-Ogooué' },
  { name: 'Akiéni', province: 'Haut-Ogooué' },
  { name: 'Lambaréné', province: 'Moyen-Ogooué' },
  { name: 'Ndjolé', province: 'Moyen-Ogooué' },
  { name: 'Mouila', province: 'Ngounié' },
  { name: 'Fougamou', province: 'Ngounié' },
  { name: 'Ndendé', province: 'Ngounié' },
  { name: 'Mbigou', province: 'Ngounié' },
  { name: 'Tchibanga', province: 'Nyanga' },
  { name: 'Mayumba', province: 'Nyanga' },
  { name: 'Makokou', province: 'Ogooué-Ivindo' },
  { name: 'Booué', province: 'Ogooué-Ivindo' },
  { name: 'Koulamoutou', province: 'Ogooué-Lolo' },
  { name: 'Lastoursville', province: 'Ogooué-Lolo' },
  { name: 'Oyem', province: 'Woleu-Ntem' },
  { name: 'Bitam', province: 'Woleu-Ntem' },
  { name: 'Mitzic', province: 'Woleu-Ntem' },
  { name: 'Minvoul', province: 'Woleu-Ntem' },
];

export const GABON_CITY_NAMES = GABON_CITIES.map((city) => city.name);

/** Retourne la province d'une ville connue, ou `null`. */
export function findProvinceForCity(city: string): GabonProvince | null {
  return GABON_CITIES.find((entry) => entry.name === city)?.province ?? null;
}

/** Libellés français des états d'une annonce. */
export const AD_STATUS_LABELS: Record<AdStatus, string> = {
  draft: 'Brouillon',
  pending_review: 'En attente de validation',
  published: 'En ligne',
  sold: 'Vendu',
  expired: 'Expirée',
  rejected: 'Refusée',
  archived: 'Archivée',
};

/** Libellés français de l'état d'un article. */
export const CONDITION_LABELS: Record<AdCondition, string> = {
  new: 'Neuf',
  like_new: 'Comme neuf',
  good: 'Bon état',
  fair: 'État correct',
  for_parts: 'Pour pièces',
};

/** Libellés français des modalités de prix. */
export const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  fixed: 'Prix fixe',
  negotiable: 'Prix négociable',
  free: 'Gratuit',
  on_request: 'Prix sur demande',
};

/** Options de tri proposées sur la page de recherche. */
export const SORT_LABELS: Record<AdSort, string> = {
  recent: 'Plus récentes',
  relevance: 'Pertinence',
  price_asc: 'Prix croissant',
  price_desc: 'Prix décroissant',
  popular: 'Plus consultées',
};

/** Limites appliquées à la création et à la modification d'une annonce. */
export const LISTING_LIMITS = {
  titleMin: 5,
  titleMax: 120,
  descriptionMin: 20,
  descriptionMax: 5000,
  priceMax: 5_000_000_000,
  maxImages: 8,
  maxImageBytes: 5 * 1024 * 1024,
  /** Durée de vie d'une annonce publiée, en jours. */
  publicationDays: 60,
} as const;

/** Types MIME acceptés pour les photos d'annonces. */
export const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

/** Buckets Supabase Storage (voir la migration `…_storage.sql`). */
export const AD_IMAGES_BUCKET = 'ad-images';
export const AVATARS_BUCKET = 'avatars';
export const MESSAGE_ATTACHMENTS_BUCKET = 'message-attachments';
export const VERIFICATION_DOCS_BUCKET = 'verification-docs';

/**
 * Limites de la messagerie. Le bucket `message-attachments` est configuré à
 * 5 Mo côté Supabase : la borne côté client doit rester alignée, sinon l'envoi
 * échoue après le transfert plutôt qu'avant.
 */
export const MESSAGE_LIMITS = {
  bodyMax: 2000,
  attachmentMaxBytes: 5 * 1024 * 1024,
} as const;

/** Nombre d'annonces par page sur la recherche. */
export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 48;

/** Navigation principale du site. */
export const MAIN_NAV = [
  { href: '/annonces', label: 'Annonces' },
  { href: '/categories', label: 'Catégories' },
  { href: '/securite', label: 'Sécurité' },
  { href: '/contact', label: 'Contact' },
] as const;
