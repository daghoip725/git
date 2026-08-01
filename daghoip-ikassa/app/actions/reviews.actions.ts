'use server';

/**
 * Avis entre utilisateurs.
 *
 * L'éligibilité (« ai-je réellement échangé avec cette personne ? ») est
 * tranchée par la politique RLS `reviews_insert_author`, qui appelle
 * `public.can_review()`. Un avis forgé via l'API est donc refusé par la base,
 * indépendamment de ce que fait l'application.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { toFieldErrors } from '@/utils/validation';

const reviewSchema = z.object({
  adId: z.string().uuid().nullable(),
  revieweeId: z.string().uuid(),
  rating: z.coerce.number().int().min(1, 'Note minimale : 1.').max(5, 'Note maximale : 5.'),
  comment: z
    .string()
    .trim()
    .max(1000, 'Le commentaire ne peut pas dépasser 1000 caractères.')
    .nullable(),
});

export async function createReviewAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const comment = formData.get('comment');
    const adId = formData.get('adId');

    const parsed = reviewSchema.safeParse({
      adId: typeof adId === 'string' && adId !== '' ? adId : null,
      revieweeId: formData.get('revieweeId'),
      rating: formData.get('rating'),
      comment: typeof comment === 'string' && comment.trim() !== '' ? comment.trim() : null,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    if (parsed.data.revieweeId === user.id) {
      return { success: false, error: 'Vous ne pouvez pas vous évaluer vous-même.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.from('reviews').insert({
      ad_id: parsed.data.adId,
      reviewer_id: user.id,
      reviewee_id: parsed.data.revieweeId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
    });

    if (error) {
      // 23505 : un avis existe déjà pour ce couple (auteur, annonce).
      if (error.code === '23505') {
        return { success: false, error: 'Vous avez déjà laissé un avis pour cette annonce.' };
      }
      // 42501 : la RLS a refusé — pas de mise en relation préalable.
      if (error.code === '42501') {
        return {
          success: false,
          error:
            'Vous ne pouvez évaluer que des personnes avec qui vous avez échangé via la messagerie.',
        };
      }
      logger.error('Création d’avis impossible', error, { userId: user.id });
      return fail(error, 'Impossible d’enregistrer votre avis.');
    }

    revalidatePath(`/vendeurs/${parsed.data.revieweeId}`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Réponse publique de l'évalué à un avis reçu. */
export async function replyToReviewAction(
  reviewId: string,
  reply: string,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = z
      .object({
        reviewId: z.string().uuid(),
        reply: z.string().trim().min(1).max(1000),
      })
      .safeParse({ reviewId, reply });

    if (!parsed.success) return { success: false, error: 'Réponse invalide.' };

    const supabase = await createClient();
    const { error } = await supabase
      .from('reviews')
      .update({ reply: parsed.data.reply, replied_at: new Date().toISOString() })
      .eq('id', parsed.data.reviewId);

    if (error) return fail(error, 'Impossible d’enregistrer votre réponse.');

    revalidatePath('/compte/avis');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
