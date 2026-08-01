/**
 * Utilitaires de numéros de téléphone gabonais.
 *
 * Format national : un `0` suivi de 8 chiffres (ex. `06 12 34 56 78`).
 * Format international : `+241` suivi du numéro national (`+24106123456 78`).
 * Les préfixes mobiles courants sont 060-069, 070-079, 074, 077 (Airtel, Moov).
 */
import { GABON_DIAL_CODE } from '@/utils/constants';

/** Ne conserve que les chiffres et un éventuel `+` initial. */
function stripFormatting(input: string): string {
  return input.trim().replace(/[\s().-]/g, '');
}

/**
 * Normalise un numéro saisi par l'utilisateur vers le format E.164 `+241XXXXXXXX`.
 * Retourne `null` si le numéro n'est pas un numéro gabonais plausible.
 *
 * Accepte : `06123456 78`, `061234567 8`, `+241 06 12 34 56 78`, `0024106...`
 */
export function normalizeGabonPhone(input: string): string | null {
  let value = stripFormatting(input);
  if (!value) return null;

  if (value.startsWith('00')) value = `+${value.slice(2)}`;
  if (value.startsWith('+241')) value = value.slice(4);
  else if (value.startsWith('241') && value.length > 9) value = value.slice(3);

  if (!/^\d+$/.test(value)) return null;

  // Numéro national saisi sans le zéro initial.
  if (value.length === 8) value = `0${value}`;
  if (value.length !== 9 || !value.startsWith('0')) return null;

  return `${GABON_DIAL_CODE}${value}`;
}

/** Vrai si la chaîne correspond à un numéro gabonais valide. */
export function isValidGabonPhone(input: string): boolean {
  return normalizeGabonPhone(input) !== null;
}

/**
 * Met en forme un numéro E.164 pour l'affichage : `+241 06 12 34 56 78`.
 * Retourne la valeur d'origine si elle n'est pas normalisable.
 */
export function formatGabonPhone(input: string | null | undefined): string {
  if (!input) return '';
  const normalized = normalizeGabonPhone(input);
  if (!normalized) return input;

  const national = normalized.slice(GABON_DIAL_CODE.length); // 0XXXXXXXX
  const groups = national.slice(1).match(/.{1,2}/g) ?? [];
  return `${GABON_DIAL_CODE} ${national.charAt(0)}${groups.join(' ')}`.replace(
    `${GABON_DIAL_CODE} 0`,
    `${GABON_DIAL_CODE} 0`,
  );
}

/** Lien `tel:` prêt à l'emploi. */
export function toTelHref(input: string | null | undefined): string | null {
  const normalized = input ? normalizeGabonPhone(input) : null;
  return normalized ? `tel:${normalized}` : null;
}

/**
 * Lien `wa.me` (WhatsApp) avec message pré-rempli.
 * WhatsApp attend le numéro international **sans** le `+` ni le zéro national.
 */
export function toWhatsAppHref(input: string | null | undefined, message?: string): string | null {
  const normalized = input ? normalizeGabonPhone(input) : null;
  if (!normalized) return null;

  const digits = normalized.replace('+', '').replace(/^2410/, '241');
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${query}`;
}
