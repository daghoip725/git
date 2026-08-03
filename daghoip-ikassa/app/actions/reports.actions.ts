'use server';

/**
 * Signalements (modération communautaire).
 *
 * Une même personne ne signale qu'une fois la même cible : index unique
 * `reports_unique_ad_reporter_idx` pour les annonces,
 * `reports_unique_user_reporter_idx` pour les comptes.
 */
import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { reportSchema, reportUserSchema, toFieldErrors } from '@/utils/validation';

export async function reportListingAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(
      `report:${user.id}`,
      RATE_LIMITS.report.limit,
      RATE_LIMITS.report.windowMs,
    );
    if (!rate.success) {
      return { success: false, error: 'Trop de signalements envoyés aujourd’hui.' };
    }

    const details = formData.get('details');
    const parsed = reportSchema.safeParse({
      listingId: formData.get('listingId'),
      reason: formData.get('reason'),
      details: typeof details === 'string' && details.trim() !== '' ? details.trim() : null,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id,
      // La contrainte `reports_target_matches_type` impose la cohérence entre
      // `target_type` et la colonne de cible renseignée.
      target_type: 'ad',
      ad_id: parsed.data.listingId,
      reason: parsed.data.reason,
      details: parsed.data.details,
    });

    if (error) {
      // 23505 = signalement déjà enregistré : on considère l'action réussie.
      if (error.code === '23505') return ok(null);
      logger.error('Signalement impossible', error, { userId: user.id });
      return fail(error, 'Impossible d’enregistrer votre signalement.');
    }

    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Signalement d'un compte.
 *
 * Distinct du signalement d'annonce, et pas seulement pour la cible :
 * l'arnaqueur type ne publie pas une mauvaise annonce, il en publie dix
 * correctes et démarche en messagerie. C'est le compte qu'il faut pouvoir
 * désigner.
 *
 * `report_user()` applique le reste — auto-signalement refusé, déduplication,
 * `reporter_id` non falsifiable.
 */
export async function reportUserAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(
      `report:${user.id}`,
      RATE_LIMITS.report.limit,
      RATE_LIMITS.report.windowMs,
    );
    if (!rate.success) {
      return { success: false, error: 'Trop de signalements envoyés aujourd’hui.' };
    }

    const details = formData.get('details');
    const parsed = reportUserSchema.safeParse({
      userId: formData.get('userId'),
      reason: formData.get('reason'),
      details: typeof details === 'string' && details.trim() !== '' ? details.trim() : null,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc('report_user', {
      p_user_id: parsed.data.userId,
      p_reason: parsed.data.reason,
      p_details: parsed.data.details,
    });

    if (error) {
      logger.warn('Signalement de compte refusé', { code: error.code });
      return fail(error, 'Impossible d’enregistrer votre signalement.');
    }

    // Un doublon renvoie `null` sans erreur : du point de vue de la personne
    // qui signale, l'action a bien abouti — inutile de lui apprendre qu'elle
    // avait déjà signalé ce compte.
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
