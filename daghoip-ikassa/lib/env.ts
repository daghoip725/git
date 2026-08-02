/**
 * Validation des variables d'environnement.
 *
 * - `publicEnv` est utilisable partout (client + serveur). Les valeurs sont
 *   référencées statiquement pour que Next.js puisse les inliner au build.
 * - `getServerEnv()` n'est appelable que côté serveur : il donne accès aux
 *   secrets (clé `service_role`) et lève une erreur explicite s'ils manquent.
 */
import { z } from 'zod';

/**
 * Fournisseur de tuiles de la carte de repérage.
 *
 * Par défaut OpenStreetMap, dont la politique d'usage tolère un trafic modéré
 * et impose l'attribution. Pour un trafic soutenu, remplacez ces deux variables
 * par celles d'un fournisseur payant — et **pensez à la CSP** : `next.config.ts`
 * dérive l'hôte autorisé en `img-src` de `NEXT_PUBLIC_MAP_TILE_URL`.
 */
const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_TILE_ATTRIBUTION = '© contributeurs OpenStreetMap';

/** Gabarit de tuile : HTTPS, et les trois marqueurs `{z}`, `{x}`, `{y}`. */
const tileUrlSchema = z
  .string()
  .startsWith('https://', 'Le gabarit de tuiles doit être servi en HTTPS.')
  .refine((value) => ['{z}', '{x}', '{y}'].every((token) => value.includes(token)), {
    message: 'Le gabarit de tuiles doit contenir {z}, {x} et {y}.',
  });

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL doit être une URL valide.'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY manquante.'),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_MAP_TILE_URL: tileUrlSchema.default(DEFAULT_TILE_URL),
  NEXT_PUBLIC_MAP_ATTRIBUTION: z.string().min(1).default(DEFAULT_TILE_ATTRIBUTION),
});

const parsedPublic = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_MAP_TILE_URL: process.env.NEXT_PUBLIC_MAP_TILE_URL || undefined,
  NEXT_PUBLIC_MAP_ATTRIBUTION: process.env.NEXT_PUBLIC_MAP_ATTRIBUTION || undefined,
});

if (!parsedPublic.success) {
  const details = parsedPublic.error.issues.map((issue) => `  - ${issue.message}`).join('\n');
  throw new Error(
    `Configuration invalide : variables d'environnement publiques manquantes.\n${details}\n` +
      'Copiez .env.example vers .env.local et renseignez vos clés Supabase.',
  );
}

export const publicEnv = parsedPublic.data;

/**
 * Identifiants Mobile Money.
 *
 * Tous facultatifs : un opérateur dont les identifiants manquent est simplement
 * absent de la liste des moyens de paiement (`isConfigured()` répond `false`).
 * L'application démarre donc sans contrat opérateur — on encaisse alors par
 * virement ou en espèces, avec confirmation manuelle par un administrateur.
 *
 * ⚠️ Ces valeurs sont des secrets : aucune ne porte le préfixe `NEXT_PUBLIC_`,
 * elles ne quittent donc jamais le serveur.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  AIRTEL_MONEY_BASE_URL: z.string().url().optional(),
  AIRTEL_MONEY_CLIENT_ID: z.string().min(1).optional(),
  AIRTEL_MONEY_CLIENT_SECRET: z.string().min(1).optional(),
  /** Secret partagé servant à authentifier les rappels (HMAC-SHA256). */
  AIRTEL_MONEY_CALLBACK_SECRET: z.string().min(16).optional(),

  MOOV_MONEY_BASE_URL: z.string().url().optional(),
  MOOV_MONEY_CLIENT_ID: z.string().min(1).optional(),
  MOOV_MONEY_CLIENT_SECRET: z.string().min(1).optional(),
  MOOV_MONEY_CALLBACK_SECRET: z.string().min(16).optional(),

  /**
   * Assistant de rédaction (facultatif). Sans clé, les boutons « Rédiger » et
   * « Corriger les fautes » ne sont pas affichés — le dépôt d'annonce reste
   * entièrement utilisable, et le nettoyage typographique, lui, fonctionne
   * toujours puisqu'il est purement local.
   */
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  /** Surcharge du modèle. Par défaut le modèle rapide, suffisant ici. */
  AI_MODEL: z.string().min(3).optional(),
});

let cachedServerEnv: z.infer<typeof serverSchema> | null = null;

/**
 * Accès aux variables serveur. À n'appeler que depuis du code serveur
 * (Server Components, Server Actions, Route Handlers).
 */
export function getServerEnv(): z.infer<typeof serverSchema> {
  if (typeof window !== 'undefined') {
    throw new Error('getServerEnv() ne doit jamais être appelé côté client.');
  }
  if (!cachedServerEnv) {
    cachedServerEnv = serverSchema.parse({
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      NODE_ENV: process.env.NODE_ENV,

      AIRTEL_MONEY_BASE_URL: process.env.AIRTEL_MONEY_BASE_URL || undefined,
      AIRTEL_MONEY_CLIENT_ID: process.env.AIRTEL_MONEY_CLIENT_ID || undefined,
      AIRTEL_MONEY_CLIENT_SECRET: process.env.AIRTEL_MONEY_CLIENT_SECRET || undefined,
      AIRTEL_MONEY_CALLBACK_SECRET: process.env.AIRTEL_MONEY_CALLBACK_SECRET || undefined,

      MOOV_MONEY_BASE_URL: process.env.MOOV_MONEY_BASE_URL || undefined,
      MOOV_MONEY_CLIENT_ID: process.env.MOOV_MONEY_CLIENT_ID || undefined,
      MOOV_MONEY_CLIENT_SECRET: process.env.MOOV_MONEY_CLIENT_SECRET || undefined,
      MOOV_MONEY_CALLBACK_SECRET: process.env.MOOV_MONEY_CALLBACK_SECRET || undefined,

      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
      AI_MODEL: process.env.AI_MODEL || undefined,
    });
  }
  return cachedServerEnv;
}

/** URL absolue du site, utilisée pour les redirections OAuth et les métadonnées. */
export function getSiteUrl(): string {
  return (
    publicEnv.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  ).replace(/\/$/, '');
}
