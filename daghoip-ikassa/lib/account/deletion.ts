/**
 * Suppression de compte — constantes partagées.
 *
 * Ce fichier existe pour une raison précise : un module `'use server'` ne peut
 * exporter **que des fonctions asynchrones**. Y laisser le mot de confirmation
 * faisait échouer le build, et le dupliquer entre le formulaire et l'action
 * aurait été pire — les deux auraient fini par diverger, et la confirmation
 * n'aurait alors plus jamais correspondu.
 */

/**
 * Mot à recopier pour confirmer.
 *
 * Une case à cocher ne suffit pas pour un geste irréversible : elle se coche
 * par réflexe. Recopier un mot oblige à lire ce qu'on fait.
 *
 * En français quelle que soit la langue de l'interface : c'est une chaîne à
 * recopier à l'identique, pas un texte à comprendre, et la traduire ferait
 * dépendre la suppression d'un réglage sans rapport avec elle.
 */
export const DELETE_CONFIRMATION = 'SUPPRIMER';

/** Décompte de ce qui a été retiré, renvoyé par `delete_my_account()`. */
export interface DeletionSummary {
  adsArchived: number;
  imagesRemoved: number;
  favoritesRemoved: number;
  notificationsRemoved: number;
  reportsDetached: number;
}
