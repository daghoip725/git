import 'server-only';

/**
 * Résolution de la langue, côté serveur.
 *
 * Trois sources, dans cet ordre de priorité :
 *
 *  1. **le cookie** — le choix explicite de la personne, connectée ou non ;
 *  2. **`Accept-Language`** — ce que le navigateur annonce, pour une première
 *     visite ;
 *  3. **le français**, par défaut.
 *
 * La colonne `users.language` n'intervient pas ici : elle est recopiée dans le
 * cookie à la connexion et à chaque changement. La lire à chaque rendu
 * ajouterait une requête à toutes les pages du site pour une valeur qui ne
 * change presque jamais — et le cookie, lui, sert aussi aux visiteurs sans
 * compte, qui sont la majorité.
 */
import { cookies, headers } from 'next/headers';
import { cache } from 'react';

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  LOCALES,
  localeFromAcceptLanguage,
} from '@/lib/i18n/config';
import { getDictionary, type Dictionary } from '@/lib/i18n/dictionaries';

/**
 * Langue effective de la requête en cours.
 *
 * `cache()` : appelée par le gabarit racine, l'en-tête, le pied de page et les
 * pages elles-mêmes, elle ne doit lire les cookies qu'une fois par rendu.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  if (fromCookie && LOCALES.includes(fromCookie as Locale)) return fromCookie as Locale;

  try {
    const headerList = await headers();
    return localeFromAcceptLanguage(headerList.get('accept-language'));
  } catch {
    // Hors contexte de requête (génération statique) : le français, qui est de
    // toute façon la langue des pages indexées.
    return DEFAULT_LOCALE;
  }
});

/** Catalogue correspondant à la langue de la requête. */
export async function getTranslations(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
