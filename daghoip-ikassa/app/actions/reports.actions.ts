'use server';

/**
 * Signalement d'une annonce (modération communautaire).
 * Un utilisateur ne peut signaler qu'une fois la même annonce
 * (index unique `reports_unique_per_user`).
 */
import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { reportSchema, toFieldErrors } from '@/utils/validation';

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
      listing_id: parsed.data.listingId,
      reporter_id: user.id,
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
