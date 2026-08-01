/**
 * Utilitaires de numéros de téléphone gabonais.
 *
 * Deux représentations coexistent, à ne pas confondre :
 *
 *  - **National** : ce que les Gabonais écrivent et dictent, avec le zéro
 *    d'acheminement — `06 12 34 56`, `074 12 34 56`.
 *  - **E.164** : ce qui est stocké en base et envoyé aux opérateurs —
 *    `+2416123456`. L'indicatif `+241` est suivi du numéro national
 *    **sans** son zéro initial.
 *
 * Le zéro d'acheminement n'existe pas en E.164 : `+2410612345 6` serait rejeté
 * par les passerelles SMS (Twilio, Supabase) au moment d'envoyer un code de
 * connexion. La logique ci-dessous est le pendant exact de la fonction SQL
 * `public.to_e164_gabon()`, afin que client et base normalisent à l'identique.
 *
 * Le plan de numérotation gabonais compte 7 à 9 chiffres significatifs selon
 * l'opérateur et l'ancienneté de la ligne.
 */
import { GABON_DIAL_CODE } from '@/utils/constants';

/** Longueurs acceptées pour le numéro national significatif (sans le zéro). */
const MIN_NSN_LENGTH = 7;
const MAX_NSN_LENGTH = 9;

/**
 * Extrait le numéro national significatif : sans indicatif pays ni zéro
 * d'acheminement. Retourne `null` si la longueur est implausible.
 */
function toNationalSignificantNumber(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (!digits) return null;

  // Préfixe international sous ses formes courantes.
  if (digits.startsWith('00241')) digits = digits.slice(5);
  else if (digits.startsWith('241') && digits.length > MAX_NSN_LENGTH) digits = digits.slice(3);

  // Zéro d'acheminement national.
  if (digits.startsWith('0')) digits = digits.slice(1);

  if (digits.length < MIN_NSN_LENGTH || digits.length > MAX_NSN_LENGTH) return null;
  return digits;
}

/**
 * Normalise un numéro saisi librement vers l'E.164 `+241XXXXXXXX`.
 * Retourne `null` si le numéro n'est pas un numéro gabonais plausible.
 *
 * @example
 * normalizeGabonPhone('06 12 34 56')      // '+2416123456'
 * normalizeGabonPhone('+241 74 12 34 56') // '+24174123456'
 * normalizeGabonPhone('002416123456')     // '+2416123456'
 */
export function normalizeGabonPhone(input: string): string | null {
  const nsn = toNationalSignificantNumber(input);
  return nsn ? `${GABON_DIAL_CODE}${nsn}` : null;
}

/** Vrai si la chaîne correspond à un numéro gabonais valide. */
export function isValidGabonPhone(input: string): boolean {
  return normalizeGabonPhone(input) !== null;
}

/**
 * Met en forme un numéro pour l'affichage international :
 * `+2416123456` → `+241 61 23 45 6`.
 * Retourne la valeur d'origine si elle n'est pas normalisable.
 */
export function formatGabonPhone(input: string | null | undefined): string {
  if (!input) return '';
  const nsn = toNationalSignificantNumber(input);
  if (!nsn) return input;

  const groups = nsn.match(/.{1,2}/g) ?? [nsn];
  return `${GABON_DIAL_CODE} ${groups.join(' ')}`;
}

/**
 * Met en forme un numéro pour la saisie locale, avec le zéro d'acheminement :
 * `+2416123456` → `06 12 34 56`. C'est la forme que les utilisateurs
 * reconnaissent et recopient.
 */
export function formatGabonPhoneNational(input: string | null | undefined): string {
  if (!input) return '';
  const nsn = toNationalSignificantNumber(input);
  if (!nsn) return input;

  const groups = `0${nsn}`.match(/.{1,2}/g) ?? [];
  return groups.join(' ');
}

/** Lien `tel:` prêt à l'emploi (toujours en E.164). */
export function toTelHref(input: string | null | undefined): string | null {
  const normalized = input ? normalizeGabonPhone(input) : null;
  return normalized ? `tel:${normalized}` : null;
}

/**
 * Lien `wa.me` (WhatsApp) avec message pré-rempli.
 * WhatsApp attend le numéro international **sans** le `+`.
 */
export function toWhatsAppHref(input: string | null | undefined, message?: string): string | null {
  const normalized = input ? normalizeGabonPhone(input) : null;
  if (!normalized) return null;

  const digits = normalized.slice(1);
  const query = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits}${query}`;
}
