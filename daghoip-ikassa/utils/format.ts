/**
 * Fonctions de formatage orientées Gabon : prix en francs CFA, dates en français,
 * troncatures et compteurs.
 */
import { formatDistanceToNowStrict, format as formatDate, isValid, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

import type { PriceType } from '@/types';
import { CURRENCY, PRICE_TYPE_LABELS, SITE } from '@/utils/constants';

const priceFormatter = new Intl.NumberFormat(SITE.locale, {
  style: 'decimal',
  maximumFractionDigits: CURRENCY.decimals,
});

const compactFormatter = new Intl.NumberFormat(SITE.locale, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/**
 * Formate un montant en FCFA : `1500000` -> `1 500 000 FCFA`.
 * Retourne `null` si le montant est absent ou invalide.
 */
export function formatPrice(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  return `${priceFormatter.format(Math.round(amount))} ${CURRENCY.symbol}`;
}

/**
 * Rend le prix affichable d'une annonce en tenant compte de la modalité :
 * « Gratuit », « Prix sur demande » ou le montant formaté.
 */
export function formatListingPrice(price: number | null, priceType: PriceType): string {
  if (priceType === 'free') return 'Gratuit';
  if (priceType === 'on_request' || price === null) return PRICE_TYPE_LABELS.on_request;

  const formatted = formatPrice(price);
  if (!formatted) return PRICE_TYPE_LABELS.on_request;
  return priceType === 'negotiable' ? `${formatted} (négociable)` : formatted;
}

/** Abrège les grands nombres : `1234` -> `1,2 k`. */
export function formatCompactNumber(value: number): string {
  return compactFormatter.format(value);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** Date longue en français : `12 mars 2026`. */
export function formatLongDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? formatDate(date, 'd MMMM yyyy', { locale: fr }) : '—';
}

/** Date courte avec heure : `12/03/2026 à 14:05`. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? formatDate(date, "dd/MM/yyyy 'à' HH:mm", { locale: fr }) : '—';
}

/** Ancienneté lisible : `il y a 3 jours`. */
export function formatRelativeDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return `il y a ${formatDistanceToNowStrict(date, { locale: fr })}`;
}

/** Tronque un texte sans couper un mot au milieu. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const sliced = text.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? sliced.slice(0, lastSpace) : sliced).trimEnd()}…`;
}

/** Initiales utilisées comme avatar de repli. */
export function getInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
