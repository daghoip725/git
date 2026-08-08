/**
 * Langues de l'interface.
 *
 * **Français d'abord**, et ce n'est pas un défaut technique : c'est la langue
 * des affaires au Gabon, celle dans laquelle les annonces sont écrites et les
 * négociations se mènent. L'anglais vient en second — la communauté d'affaires
 * régionale et expatriée de Libreville et Port-Gentil n'est pas marginale, et
 * l'adhésion du Gabon au Commonwealth en 2022 l'a rendue plus visible encore.
 *
 * ## Ce que le choix de la langue change, et ce qu'il ne change pas
 *
 * Il traduit **l'interface** : navigation, formulaires, boutons, messages
 * d'erreur, espace personnel. Il ne traduit **pas le contenu** — titres et
 * descriptions d'annonces, messages entre acheteurs et vendeurs, noms de villes
 * et de quartiers restent tels qu'ils ont été écrits.
 *
 * Ce n'est pas une limite qu'on s'excuse d'avoir : traduire automatiquement une
 * annonce, c'est en changer le sens sans que son auteur puisse le vérifier —
 * un prix « à débattre » devenu ferme, un « bon état » devenu « comme neuf ».
 * Sur une plateforme où l'on s'engage sur ce qui est écrit, c'est un risque
 * qu'on ne prend pas.
 */

/** Codes de langue disponibles. Doit rester aligné sur l'enum `app_language`. */
export const LOCALES = ['fr', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

/** Langue par défaut, et repli de toute résolution. */
export const DEFAULT_LOCALE: Locale = 'fr';

/**
 * Cookie portant le choix de langue.
 *
 * Un cookie et pas seulement la colonne `users.language` : la majorité des
 * visites d'une plateforme d'annonces se font sans compte, et réserver le choix
 * aux personnes connectées reviendrait à en priver la plupart des gens. Pour un
 * compte, les deux sont tenus en phase.
 *
 * C'est la **seule** source de la langue affichée. `Accept-Language` n'est pas
 * consulté : voir `lib/i18n/server.ts` pour la raison, constatée en regardant
 * l'application tourner.
 */
export const LOCALE_COOKIE = 'ikassa:langue';

/** Un an : un choix de langue ne se redemande pas à chaque visite. */
export const LOCALE_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * Étiquettes des langues, **écrites dans leur propre langue**.
 *
 * « English » et non « Anglais » : quelqu'un qui cherche sa langue dans une
 * liste ne sait pas forcément comment elle se dit dans celle qu'il ne lit pas.
 */
export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français',
  en: 'English',
};

/**
 * Étiquette BCP 47 complète, pour `<html lang>` et la mise en forme.
 *
 * `fr-GA` et non `fr-FR` : les francs CFA, les formats de date et la
 * numérotation locale en dépendent.
 */
export const LOCALE_TAGS: Record<Locale, string> = {
  fr: 'fr-GA',
  en: 'en-GB',
};

/** Étiquette Open Graph correspondante. */
export const LOCALE_OG_TAGS: Record<Locale, string> = {
  fr: 'fr_GA',
  en: 'en_GB',
};

/** Ramène n'importe quelle entrée à une langue connue. */
export function normalizeLocale(value: unknown): Locale {
  return LOCALES.includes(value as Locale) ? (value as Locale) : DEFAULT_LOCALE;
}
