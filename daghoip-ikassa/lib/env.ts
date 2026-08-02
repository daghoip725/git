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

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
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
