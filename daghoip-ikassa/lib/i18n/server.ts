import 'server-only';

/**
 * Résolution de la langue, côté serveur.
 *
 * Deux sources seulement : **le choix explicite** de la personne (cookie), et
 * **le français** à défaut.
 *
 * ## Pourquoi `Accept-Language` n'entre PAS en compte
 *
 * Il y entrait, et le résultat s'est révélé mauvais dès qu'on a regardé
 * l'application tourner : un navigateur configuré en anglais obtenait une
 * navigation anglaise **par-dessus un contenu français**. Titres d'annonces,
 * descriptions, villes, quartiers, et toute la partie de l'interface qui n'est
 * pas encore traduite restaient en français — seule la barre latérale du compte
 * basculait. Une page mi-anglaise mi-française est pire que la même page
 * entièrement en français.
 *
 * Le raisonnement tient tant que la traduction est partielle, ce qui est le cas
 * aujourd'hui. Il tiendra encore ensuite pour une autre raison : au Gabon, un
 * téléphone configuré en anglais ne signifie pas que son propriétaire préfère
 * lire des annonces en anglais. Deviner sa langue à partir de son appareil,
 * c'est se tromper souvent — et lui imposer la correction à chaque visite.
 *
 * La colonne `users.language` n'intervient pas ici non plus : elle est recopiée
 * dans le cookie à chaque changement. La lire à chaque rendu ajouterait une
 * requête à toutes les pages du site pour une valeur qui ne change presque
 * jamais — et le cookie, lui, sert aussi aux visiteurs sans compte, qui sont la
 * majorité.
 */
import { cookies } from 'next/headers';
import { cache } from 'react';

import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, LOCALES } from '@/lib/i18n/config';
import { getDictionary, type Dictionary } from '@/lib/i18n/dictionaries';

/**
 * Langue effective de la requête en cours.
 *
 * `cache()` : appelée par le gabarit racine, l'en-tête, le pied de page et les
 * pages elles-mêmes, elle ne doit lire les cookies qu'une fois par rendu.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  try {
    const store = await cookies();
    const choisie = store.get(LOCALE_COOKIE)?.value;
    if (choisie && LOCALES.includes(choisie as Locale)) return choisie as Locale;
  } catch {
    // Hors contexte de requête (génération statique) : pas de cookie à lire.
  }

  return DEFAULT_LOCALE;
});

/** Catalogue correspondant à la langue de la requête. */
export async function getTranslations(): Promise<Dictionary> {
  return getDictionary(await getLocale());
}
