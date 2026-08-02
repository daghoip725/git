/**
 * Schémas de validation Zod partagés entre le client (feedback immédiat) et le
 * serveur (source de vérité). **Toute** Server Action revalide ses entrées avec
 * ces schémas : ne jamais faire confiance au formulaire.
 */
import { z } from 'zod';

import {
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_PAGE_SIZE,
  GABON_CITY_NAMES,
  LISTING_LIMITS,
  MAX_PAGE_SIZE,
} from '@/utils/constants';
import { normalizeGabonPhone } from '@/utils/phone';

/** Champ texte obligatoire, nettoyé des espaces superflus. */
const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} doit contenir au moins ${min} caractères.`)
    .max(max, `${label} ne peut pas dépasser ${max} caractères.`);

/** Numéro gabonais normalisé en E.164, ou `null` si le champ est vide. */
export const gabonPhoneSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (!value) return null;
    const normalized = normalizeGabonPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: 'custom',
        message: 'Numéro gabonais invalide (ex. 06 12 34 56 78).',
      });
      return z.NEVER;
    }
    return normalized;
  });

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'L’adresse e-mail est obligatoire.')
  .email('Adresse e-mail invalide.');

/**
 * Mot de passe : 8 caractères minimum avec au moins une lettre et un chiffre.
 * Supabase applique en complément sa propre politique côté serveur.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères.')
  .max(72, 'Le mot de passe ne peut pas dépasser 72 caractères.')
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre.')
  .regex(/\d/, 'Le mot de passe doit contenir au moins un chiffre.');

export const signUpSchema = z
  .object({
    fullName: trimmed(2, 80, 'Le nom complet'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    phone: gabonPhoneSchema.nullable().optional(),
    city: z.string().trim().max(80).optional(),
    acceptTerms: z.literal(true, {
      message: 'Vous devez accepter les conditions d’utilisation.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Le mot de passe est obligatoire.'),
});

export const resetPasswordRequestSchema = z.object({ email: emailSchema });

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

export const profileSchema = z.object({
  fullName: trimmed(2, 80, 'Le nom complet'),
  phone: gabonPhoneSchema.nullable(),
  whatsapp: gabonPhoneSchema.nullable(),
  city: z.string().trim().max(80).nullable(),
  province: z.string().trim().max(80).nullable(),
  bio: z.string().trim().max(500, 'La bio ne peut pas dépasser 500 caractères.').nullable(),
  isProfessional: z.boolean().default(false),
  /** Chemin dans le bucket `avatars` : `<user_id>/<uuid>.<ext>`. */
  avatarPath: z
    .string()
    .trim()
    .max(500)
    .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/i, 'Avatar invalide.')
    .nullable(),
});

/** Détecte les coordonnées glissées dans un texte libre (anti-contournement). */
const CONTACT_IN_TEXT = /(\+?241[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})/;

/** Durées de publication proposées, en jours. La base borne à 7–90. */
export const PUBLICATION_DURATIONS = [30, 60, 90] as const;

/**
 * Coordonnée géographique optionnelle.
 * Les deux valeurs vont de pair : une latitude sans longitude n'a aucun sens,
 * et le trigger côté base écarte de toute façon une coordonnée orpheline.
 */
const coordinateSchema = (min: number, max: number, label: string) =>
  z.number().min(min, `${label} hors limites.`).max(max, `${label} hors limites.`).nullable();

export const listingSchema = z.object({
  title: trimmed(LISTING_LIMITS.titleMin, LISTING_LIMITS.titleMax, 'Le titre'),
  description: trimmed(
    LISTING_LIMITS.descriptionMin,
    LISTING_LIMITS.descriptionMax,
    'La description',
  ),
  categoryId: z.string().uuid('Veuillez choisir une catégorie.'),
  priceType: z.enum(['fixed', 'negotiable', 'free', 'on_request']),
  price: z
    .number({ message: 'Le prix doit être un nombre.' })
    .int('Le prix doit être un nombre entier de FCFA.')
    .min(0, 'Le prix ne peut pas être négatif.')
    .max(LISTING_LIMITS.priceMax, 'Le prix saisi est trop élevé.')
    .nullable(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).nullable(),
  city: z
    .string()
    .trim()
    .min(2, 'La ville est obligatoire.')
    .max(80)
    .refine((value) => GABON_CITY_NAMES.includes(value), {
      message: 'Veuillez choisir une ville du Gabon dans la liste.',
    }),
  district: z.string().trim().max(80).nullable(),
  contactPhone: gabonPhoneSchema.nullable(),
  contactWhatsapp: gabonPhoneSchema.nullable(),
  allowMessages: z.boolean().default(true),

  /** Position approximative, arrondie côté base à ~110 m. */
  latitude: coordinateSchema(-90, 90, 'La latitude'),
  longitude: coordinateSchema(-180, 180, 'La longitude'),

  /** Durée de publication souhaitée. */
  durationDays: z
    .number()
    .int()
    .refine((value) => (PUBLICATION_DURATIONS as readonly number[]).includes(value), {
      message: 'Durée de publication invalide.',
    })
    .default(60),

  /** Code de l'offre de mise en avant, ou `null` pour une annonce ordinaire. */
  featurePlanCode: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]+$/, 'Offre invalide.')
    .max(40)
    .nullable()
    .default(null),
});

/**
 * Règles transverses : un prix est requis pour les modalités `fixed`/`negotiable`,
 * et l'annonce doit exposer au moins un canal de contact.
 */
export const listingFormSchema = listingSchema
  .refine(
    (data) => data.priceType === 'free' || data.priceType === 'on_request' || data.price !== null,
    { message: 'Veuillez indiquer un prix.', path: ['price'] },
  )
  .refine((data) => data.allowMessages || data.contactPhone || data.contactWhatsapp, {
    message: 'Indiquez au moins un moyen de contact (téléphone, WhatsApp ou messagerie).',
    path: ['contactPhone'],
  })
  .refine((data) => !CONTACT_IN_TEXT.test(data.title), {
    message: 'Le titre ne doit pas contenir de numéro de téléphone.',
    path: ['title'],
  })
  .refine((data) => (data.latitude === null) === (data.longitude === null), {
    message: 'Position incomplète : réessayez la localisation.',
    path: ['latitude'],
  });

export type ListingFormInput = z.input<typeof listingFormSchema>;
export type ListingFormValues = z.output<typeof listingFormSchema>;

/** Validation d'un fichier image avant envoi vers Supabase Storage. */
export const imageFileSchema = z
  .instanceof(File)
  .refine((file) => file.size > 0, 'Fichier vide.')
  .refine(
    (file) => file.size <= LISTING_LIMITS.maxImageBytes,
    `Chaque image doit peser moins de ${Math.round(LISTING_LIMITS.maxImageBytes / 1024 / 1024)} Mo.`,
  )
  .refine(
    (file) => (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type),
    'Format non supporté (JPEG, PNG, WebP ou AVIF uniquement).',
  );

export const messageSchema = z.object({
  listingId: z.string().uuid(),
  recipientId: z.string().uuid(),
  body: trimmed(2, 2000, 'Le message'),
});

export const reportSchema = z.object({
  listingId: z.string().uuid(),
  reason: z.enum([
    'spam',
    'fraud',
    'prohibited',
    'duplicate',
    'wrong_category',
    'offensive',
    'other',
  ]),
  details: z.string().trim().max(1000).nullable(),
});

/** Anciennetés proposées par le filtre « date de publication », en jours. */
export const PUBLICATION_AGES = [1, 7, 30, 90] as const;

/** Rayons proposés par le filtre « autour de moi », en kilomètres. */
export const SEARCH_RADII_KM = [5, 10, 25, 50] as const;

/** Coercition des paramètres d'URL de la page de recherche. */
export const listingFiltersSchema = z.object({
  query: z.string().trim().max(120).optional(),
  categorySlug: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  province: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).optional(),
  priceType: z.enum(['fixed', 'negotiable', 'free', 'on_request']).optional(),
  maxAgeDays: z.coerce.number().int().min(1).max(365).optional(),
  /**
   * Laissé **optionnel** à dessein : sans choix explicite de l'utilisateur, une
   * recherche textuelle est classée par pertinence et une navigation sans
   * texte par date. Un `.default('recent')` écraserait cette nuance.
   */
  sort: z.enum(['relevance', 'recent', 'price_asc', 'price_desc', 'popular']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/**
 * Filtre « autour de moi ».
 *
 * Il ne transite **pas par l'URL** : la position d'un visiteur n'a rien à faire
 * dans un lien partagé. Il est donc validé séparément, à l'entrée du hook de
 * recherche, avant d'être transmis à PostgreSQL — qui reborne de toute façon
 * le rayon à 200 km.
 */
export const geoFilterSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().refine((value) => (SEARCH_RADII_KM as readonly number[]).includes(value), {
    message: 'Rayon de recherche invalide.',
  }),
});

/**
 * Aplatit les erreurs Zod au format attendu par `ActionResult.fieldErrors`.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
