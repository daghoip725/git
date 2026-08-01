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
});

/** Détecte les coordonnées glissées dans un texte libre (anti-contournement). */
const CONTACT_IN_TEXT = /(\+?241[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2}[\s.-]?\d{2})/;

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

/** Coercition des paramètres d'URL de la page de recherche. */
export const listingFiltersSchema = z.object({
  query: z.string().trim().max(120).optional(),
  categorySlug: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  province: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'for_parts']).optional(),
  priceType: z.enum(['fixed', 'negotiable', 'free', 'on_request']).optional(),
  sort: z.enum(['recent', 'price_asc', 'price_desc', 'popular']).default('recent'),
  page: z.coerce.number().int().min(1).max(500).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
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
