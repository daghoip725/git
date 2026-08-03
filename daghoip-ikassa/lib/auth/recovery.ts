/**
 * Marqueur de récupération de mot de passe.
 *
 * Il n'accorde qu'une seule chose : changer son mot de passe **sans fournir
 * l'ancien**, juste après avoir suivi le lien reçu par courriel. C'est le seul
 * cas où l'ancien mot de passe ne peut pas être demandé — la personne l'a
 * précisément oublié.
 *
 * Trois propriétés le rendent inoffensif :
 *
 *  - il n'est posé qu'après un **échange de code réussi** dans
 *    `/auth/callback` : le forger suppose de détenir déjà le lien envoyé au
 *    courriel du compte, c'est-à-dire d'en contrôler la boîte ;
 *  - il est `httpOnly` : aucun script de la page ne peut le lire ni l'écrire ;
 *  - il expire vite et se consomme à la première utilisation.
 *
 * Le contenu n'a aucune importance — la présence du cookie *est* l'information.
 * Rien de secret n'y transite, donc rien à signer.
 */

/** Nom du cookie. Préfixé comme les autres réglages de la plateforme. */
export const RECOVERY_COOKIE = 'ikassa:recuperation';

/**
 * Durée de validité, en secondes.
 *
 * Dix minutes : le temps de choisir un mot de passe, pas celui d'oublier
 * l'onglet ouvert sur un poste partagé.
 */
export const RECOVERY_MAX_AGE = 10 * 60;

/** Seule destination pour laquelle le marqueur est posé. */
export const RECOVERY_NEXT_PATH = '/compte/mot-de-passe';
