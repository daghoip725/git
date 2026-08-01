import 'server-only';

/**
 * Limitation de débit en mémoire (fenêtre glissante fixe).
 *
 * Suffisant pour une instance unique et pour freiner les abus évidents
 * (spam d'annonces, brute force de connexion). En production multi-instances,
 * remplacer l'implémentation par un store partagé (Redis / Upstash) en
 * conservant la même signature `checkRateLimit`.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Purge périodique pour éviter la croissance illimitée de la Map. */
function sweep(now: number) {
  if (buckets.size < 5_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  /** Secondes avant la réinitialisation de la fenêtre. */
  retryAfter: number;
}

/**
 * Consomme un jeton pour la clé donnée.
 *
 * @param key    Identifiant de l'appelant (`action:userId` ou `action:ip`).
 * @param limit  Nombre d'actions autorisées par fenêtre.
 * @param windowMs Durée de la fenêtre en millisecondes.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: limit - 1, retryAfter: 0 };
  }

  if (bucket.count >= limit) {
    return {
      success: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }

  bucket.count += 1;
  return { success: true, remaining: limit - bucket.count, retryAfter: 0 };
}

/** Presets utilisés par les Server Actions. */
export const RATE_LIMITS = {
  createListing: { limit: 10, windowMs: 60 * 60 * 1000 },
  updateListing: { limit: 40, windowMs: 60 * 60 * 1000 },
  sendMessage: { limit: 30, windowMs: 60 * 60 * 1000 },
  report: { limit: 10, windowMs: 24 * 60 * 60 * 1000 },
  auth: { limit: 10, windowMs: 15 * 60 * 1000 },

  // --- Codes SMS -------------------------------------------------------------
  // Un SMS a un coût réel : ces limites protègent autant le budget que
  // l'utilisateur dont on pourrait « bombarder » le numéro.
  /** Envois par IP. */
  otpSend: { limit: 5, windowMs: 15 * 60 * 1000 },
  /** Envois pour un même numéro, toutes IP confondues. */
  otpPerPhone: { limit: 3, windowMs: 15 * 60 * 1000 },
  /** Tentatives de saisie du code, par IP : freine le devinage à 6 chiffres. */
  otpVerify: { limit: 10, windowMs: 15 * 60 * 1000 },

  /** Demandes de vérification vendeur. */
  verification: { limit: 3, windowMs: 24 * 60 * 60 * 1000 },
} as const;
