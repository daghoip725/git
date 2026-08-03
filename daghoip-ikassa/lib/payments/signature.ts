import 'server-only';

/**
 * Vérification de signature des rappels d'opérateur.
 *
 * Airtel Money et Moov Money signent tous deux leurs rappels par un HMAC-SHA256
 * du corps brut avec un secret partagé — c'est le schéma que retiennent la
 * plupart des passerelles Mobile Money d'Afrique centrale. La mécanique étant
 * la même, elle vit ici plutôt qu'en double dans chaque adaptateur.
 *
 * Deux précautions qui ne sont pas des détails :
 *
 *  - la signature porte sur le **corps brut**, jamais sur l'objet reparsé :
 *    `JSON.parse` puis `JSON.stringify` réordonne les clés et change les
 *    espaces, ce qui invaliderait toute signature honnête ;
 *  - la comparaison est **à temps constant** : un `===` sur des chaînes
 *    s'arrête au premier octet différent, ce qui laisse mesurer la signature
 *    attendue octet par octet.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signature attendue pour un corps donné, en hexadécimal minuscule. */
export function computeHmacSha256(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
}

/**
 * Compare deux signatures sans fuite de temps.
 *
 * Les formats rencontrés varient : hexadécimal nu, préfixé (`sha256=…`), en
 * majuscules. On normalise avant de comparer, puis on repasse en octets — car
 * `timingSafeEqual` exige deux tampons de même longueur.
 */
export function signaturesMatch(received: string | null, expected: string): boolean {
  if (!received) return false;

  const normalized = received
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  const a = Buffer.from(normalized, 'utf8');
  const b = Buffer.from(expected.toLowerCase(), 'utf8');

  // Longueurs différentes : la comparaison à temps constant refuserait de
  // s'exécuter. On répond non, sans court-circuit observable côté appelant.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Refuse les rappels trop anciens, quand l'opérateur horodate ses envois.
 *
 * Sans cette borne, un rappel authentique intercepté resterait rejouable
 * indéfiniment. `apply_payment_callback()` est idempotente, donc le rejeu ne
 * crédite pas deux fois — mais il permettrait de faire revivre un statut, et
 * pollue le journal.
 *
 * @param timestamp Horodatage annoncé (secondes ou millisecondes Unix).
 * @param toleranceSeconds Écart accepté, dans les deux sens.
 */
export function timestampIsFresh(
  timestamp: string | number | null,
  toleranceSeconds = 300,
): boolean {
  if (timestamp === null || timestamp === '') return false;

  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return false;

  // Un horodatage en secondes tient sur 10 chiffres jusqu'en 2286 ; au-delà,
  // c'est qu'il est exprimé en millisecondes.
  const millis = numeric > 1e12 ? numeric : numeric * 1000;
  return Math.abs(Date.now() - millis) <= toleranceSeconds * 1000;
}
