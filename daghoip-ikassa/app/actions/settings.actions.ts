'use server';

/**
 * Paramètres du compte : langue et suppression.
 *
 * Le changement de mot de passe vit dans `auth.actions.ts` (il relève de
 * l'authentification) et les préférences de notification dans
 * `notifications.settings.actions.ts`. Ces deux-là sont regroupés ici parce
 * qu'ils touchent la même table et le même écran.
 */
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { DELETE_CONFIRMATION } from '@/lib/account/deletion';
import { fail, ok } from '@/lib/errors';
import { LOCALE_COOKIE, LOCALE_MAX_AGE, LOCALES, type Locale } from '@/lib/i18n/config';
import { logger } from '@/lib/logger';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import type { DeletionSummary } from '@/lib/account/deletion';

/* -------------------------------------------------------------------------- */
/*  Langue                                                                    */
/* -------------------------------------------------------------------------- */

const localeSchema = z.enum(LOCALES);

/**
 * Enregistre la langue d'interface.
 *
 * Le cookie est posé **dans tous les cas**, y compris sans session : la
 * majorité des visites se font sans compte, et un choix de langue qui ne
 * survivrait pas au rechargement pour ces personnes-là ne servirait à rien.
 *
 * Pour un compte, la colonne `users.language` est mise à jour en plus, afin que
 * le choix suive d'un appareil à l'autre. Un échec de cette écriture ne fait
 * pas échouer l'action : la langue est déjà appliquée, et refuser le
 * changement pour un problème de persistance serait la pire réponse possible.
 */
export async function setLanguageAction(input: unknown): Promise<ActionResult<{ locale: Locale }>> {
  const parsed = localeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Langue inconnue.' };
  }

  const locale = parsed.data;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    // Lisible par le serveur uniquement : rien n'a besoin d'y toucher côté
    // navigateur, et le rendu est de toute façon fait côté serveur.
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOCALE_MAX_AGE,
  });

  const user = await getCurrentUser();
  if (user) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from('users').update({ language: locale }).eq('id', user.id);
      if (error) {
        logger.warn('Langue non enregistrée sur le profil', { error: error.message });
      }
    } catch (error) {
      logger.warn('Langue non enregistrée sur le profil', { error: String(error) });
    }
  }

  // Toute l'interface en dépend, pas seulement la page des paramètres.
  revalidatePath('/', 'layout');
  return ok({ locale });
}

/* -------------------------------------------------------------------------- */
/*  Suppression du compte                                                     */
/* -------------------------------------------------------------------------- */

const deleteSchema = z.object({
  confirmation: z.string(),
});

/**
 * Supprime définitivement le compte courant.
 *
 * Le travail réel est fait par `delete_my_account()`, en base : c'est la seule
 * façon d'anonymiser en une transaction, et c'est là que sont les garde-fous
 * (compte administrateur, compte déjà supprimé, absence de session). Cette
 * action ne fait que trois choses autour : confirmer l'intention, appeler la
 * fonction, puis fermer la session.
 *
 * La déconnexion est **globale** : le compte n'existe plus, aucune session
 * ouverte ailleurs n'a de raison de survivre.
 */
export async function deleteAccountAction(
  _prevState: ActionResult<DeletionSummary> | null,
  formData: FormData,
): Promise<ActionResult<DeletionSummary>> {
  try {
    const parsed = deleteSchema.safeParse({ confirmation: formData.get('confirmation') });
    if (!parsed.success || parsed.data.confirmation.trim() !== DELETE_CONFIRMATION) {
      return {
        success: false,
        error: 'Confirmation incorrecte.',
        fieldErrors: { confirmation: [`Saisissez « ${DELETE_CONFIRMATION} » pour confirmer.`] },
      };
    }

    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Votre session a expiré. Reconnectez-vous.' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('delete_my_account');

    if (error) {
      logger.error('Suppression de compte impossible', error, { userId: user.id });
      // P0001 : message écrit pour être lu (compte administrateur, compte déjà
      // supprimé). Il est neutre côté base et peut s'afficher tel quel.
      if (error.code === 'P0001') {
        return { success: false, error: error.message };
      }
      return fail(error, 'Impossible de supprimer le compte.');
    }

    const row = data?.[0];

    /*
     * La session tombe après coup. Si cet appel échouait, le compte serait
     * quand même anonymisé et `is_active_account()` lui refuserait toute
     * écriture — la suppression reste acquise, seule la déconnexion manque.
     */
    const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
    if (signOutError) {
      logger.warn('Déconnexion après suppression impossible', { code: signOutError.code });
    }

    revalidatePath('/', 'layout');

    return ok({
      adsArchived: row?.ads_archived ?? 0,
      imagesRemoved: row?.images_removed ?? 0,
      favoritesRemoved: row?.favorites_removed ?? 0,
      notificationsRemoved: row?.notifications_removed ?? 0,
      reportsDetached: row?.reports_detached ?? 0,
    });
  } catch (error) {
    return fail(error, 'Impossible de supprimer le compte.');
  }
}
