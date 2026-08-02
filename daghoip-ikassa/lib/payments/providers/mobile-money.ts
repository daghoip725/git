import 'server-only';

/**
 * Fabrique commune aux passerelles Mobile Money.
 *
 * Airtel Money et Moov Money exposent la même mécanique : OAuth 2 en
 * `client_credentials` pour obtenir un jeton court, puis un appel de collecte
 * qui déclenche une demande de confirmation sur le téléphone du payeur, puis un
 * rappel HTTP signé quand celui-ci a saisi son code. Seuls changent les chemins,
 * les noms de champs et les en-têtes.
 *
 * Cette fabrique porte donc tout ce qui est commun — jeton mis en cache,
 * délais d'attente, gestion d'erreur, vérification de signature — et chaque
 * opérateur ne décrit que ses particularités.
 *
 * ────────────────────────────────────────────────────────────────────────────
 *  ⚠️  ÉTAT D'INTÉGRATION
 *
 *  Ces adaptateurs sont **structurellement complets mais non éprouvés contre
 *  les API réelles** : ils ont été écrits d'après la forme publique de ces
 *  passerelles, sans contrat marchand ni accès bac à sable. Avant la première
 *  mise en production avec un opérateur, il faut impérativement :
 *
 *   1. confronter `tokenPath`, `collectPath` et les noms de champs à la
 *      documentation contractuelle remise par l'opérateur ;
 *   2. vérifier le schéma de signature des rappels — l'HMAC-SHA256 du corps
 *      brut retenu ici est le plus courant, mais certains contrats utilisent
 *      une signature RSA ou une simple liste blanche d'adresses IP ;
 *   3. confirmer le format du numéro attendu (avec ou sans indicatif) ;
 *   4. rejouer un encaissement complet en bac à sable, rappel compris.
 *
 *  Tant que les identifiants ne sont pas renseignés, `isConfigured()` répond
 *  `false` et le moyen de paiement n'est pas proposé : aucun payeur ne peut
 *  donc tomber sur une intégration non validée.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { logger } from '@/lib/logger';
import { computeHmacSha256, signaturesMatch, timestampIsFresh } from '@/lib/payments/signature';
import type {
  CallbackRequest,
  InitiationResult,
  ParsedCallback,
  PaymentIntent,
  PaymentProviderAdapter,
  VerificationResult,
} from '@/lib/payments/types';
import type { PaymentProvider } from '@/types/database';

/** Délai au-delà duquel on abandonne un appel opérateur (ms). */
const REQUEST_TIMEOUT_MS = 15_000;

/** Marge de sécurité sur l'expiration du jeton, pour ne pas l'utiliser à la seconde près. */
const TOKEN_SAFETY_MARGIN_MS = 30_000;

export interface MobileMoneyCredentials {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  callbackSecret: string;
}

export interface MobileMoneyConfig {
  code: PaymentProvider;
  label: string;
  hint: string;
  /** Chemin du jeton OAuth 2, relatif à `baseUrl`. */
  tokenPath: string;
  /** Chemin de la demande de collecte, relatif à `baseUrl`. */
  collectPath: string;
  /** En-tête portant la signature du rappel. */
  signatureHeader: string;
  /** En-tête portant l'horodatage du rappel, quand l'opérateur en émet un. */
  timestampHeader?: string;
  /** Identifiants lus dans l'environnement, ou `null` s'ils sont incomplets. */
  readCredentials: () => MobileMoneyCredentials | null;
  /** En-têtes propres à l'opérateur, ajoutés à chaque appel authentifié. */
  extraHeaders?: Record<string, string>;
  /** Corps de la demande de collecte. */
  buildCollectBody: (intent: PaymentIntent, msisdn: string) => Record<string, unknown>;
  /** Extrait la référence opérateur de la réponse de collecte. */
  readProviderReference: (payload: Record<string, unknown>) => string | null;
  /** Traduit un rappel authentifié. Retourne `null` si le corps est inexploitable. */
  parseCallback: (payload: Record<string, unknown>) => ParsedCallback | null;
}

/**
 * Numéro attendu par les passerelles gabonaises : le numéro national, sans
 * indicatif ni zéro de tête. `+2416123456` devient `6123456`.
 */
export function toMsisdn(payerPhone: string | null): string | null {
  if (!payerPhone) return null;
  const digits = payerPhone.replace(/[^\d]/g, '');
  return digits.startsWith('241') ? digits.slice(3) : digits;
}

/** Lit un objet JSON sans jamais laisser échapper d'exception de parsage. */
function safeParseJson(raw: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function createMobileMoneyProvider(config: MobileMoneyConfig): PaymentProviderAdapter {
  /**
   * Jeton mémorisé le temps de sa validité. Le cache est volontairement porté
   * par la clôture plutôt que par un module partagé : deux opérateurs n'ont
   * aucune raison de se marcher dessus.
   */
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function fetchToken(credentials: MobileMoneyCredentials): Promise<string | null> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + TOKEN_SAFETY_MARGIN_MS) {
      return cachedToken.value;
    }

    try {
      const response = await fetch(new URL(config.tokenPath, credentials.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          grant_type: 'client_credentials',
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });

      if (!response.ok) {
        logger.error('Jeton Mobile Money refusé', new Error(`HTTP ${response.status}`), {
          provider: config.code,
        });
        return null;
      }

      const payload = safeParseJson(await response.text());
      const token = typeof payload?.access_token === 'string' ? payload.access_token : null;
      if (!token) return null;

      // `expires_in` est en secondes chez les deux opérateurs ; à défaut, on
      // retient une heure, valeur usuelle des contrats.
      const lifetime = typeof payload?.expires_in === 'number' ? payload.expires_in : 3600;
      cachedToken = { value: token, expiresAt: Date.now() + lifetime * 1000 };
      return token;
    } catch (error) {
      logger.error('Appel du jeton Mobile Money impossible', error, { provider: config.code });
      return null;
    }
  }

  return {
    code: config.code,
    label: config.label,
    hint: config.hint,

    isConfigured() {
      return config.readCredentials() !== null;
    },

    async initiate(intent: PaymentIntent): Promise<InitiationResult> {
      const credentials = config.readCredentials();
      if (!credentials) {
        return { kind: 'error', message: 'Ce moyen de paiement n’est pas encore disponible.' };
      }

      const msisdn = toMsisdn(intent.payerPhone);
      if (!msisdn) {
        return {
          kind: 'error',
          message: 'Indiquez le numéro Mobile Money à débiter pour poursuivre.',
        };
      }

      const token = await fetchToken(credentials);
      if (!token) {
        return {
          kind: 'error',
          message: 'L’opérateur est momentanément injoignable. Réessayez dans quelques minutes.',
        };
      }

      try {
        const response = await fetch(new URL(config.collectPath, credentials.baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            ...config.extraHeaders,
          },
          body: JSON.stringify(config.buildCollectBody(intent, msisdn)),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: 'no-store',
        });

        const payload = safeParseJson(await response.text()) ?? {};

        if (!response.ok) {
          // On ne recopie jamais le message de l'opérateur tel quel vers le
          // payeur : il contient parfois des identifiants techniques.
          logger.error('Collecte Mobile Money refusée', new Error(`HTTP ${response.status}`), {
            provider: config.code,
            reference: intent.reference,
          });
          return {
            kind: 'error',
            message: 'L’opérateur a refusé la demande. Vérifiez votre numéro et votre solde.',
          };
        }

        return {
          kind: 'push',
          providerReference: config.readProviderReference(payload),
          message:
            'Une demande de confirmation a été envoyée sur votre téléphone. ' +
            'Saisissez votre code secret pour valider le paiement.',
        };
      } catch (error) {
        logger.error('Collecte Mobile Money impossible', error, {
          provider: config.code,
          reference: intent.reference,
        });
        return {
          kind: 'error',
          message: 'La demande n’a pas pu être transmise. Réessayez dans quelques minutes.',
        };
      }
    },

    async verifyCallback(request: CallbackRequest): Promise<VerificationResult> {
      const credentials = config.readCredentials();
      if (!credentials) {
        return { valid: false, reason: 'Opérateur non configuré sur cette instance.' };
      }

      const signature = request.headers.get(config.signatureHeader);
      if (!signature) {
        return { valid: false, reason: 'Signature absente.' };
      }

      // La signature porte sur les octets reçus : reparser puis re-sérialiser
      // le corps changerait l'ordre des clés et invaliderait toute signature.
      const expected = computeHmacSha256(request.rawBody, credentials.callbackSecret);
      if (!signaturesMatch(signature, expected)) {
        return { valid: false, reason: 'Signature invalide.' };
      }

      if (config.timestampHeader) {
        const stamp = request.headers.get(config.timestampHeader);
        if (!timestampIsFresh(stamp)) {
          return { valid: false, reason: 'Horodatage absent ou périmé (rejeu probable).' };
        }
      }

      return { valid: true };
    },

    parseCallback(rawBody: string): ParsedCallback | null {
      const payload = safeParseJson(rawBody);
      return payload ? config.parseCallback(payload) : null;
    },
  };
}
