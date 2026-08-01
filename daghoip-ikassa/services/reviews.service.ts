import 'server-only';

/**
 * Avis entre utilisateurs.
 *
 * Un avis n'est recevable que s'il existe une mise en relation réelle : la
 * politique RLS `reviews_insert_author` appelle `public.can_review()`, qui
 * exige une conversation ayant donné lieu à au moins un message entre les deux
 * parties. La note moyenne du destinataire est recalculée par trigger.
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getAvatarUrl } from '@/services/storage.service';
import type { Review } from '@/types';

export interface ReviewWithAuthor extends Review {
  reviewer: {
    id: string;
    full_name: string;
    avatar_path: string | null;
  } | null;
  reviewerAvatarUrl: string | null;
}

const REVIEW_COLUMNS = `
  id, ad_id, reviewer_id, reviewee_id, rating, comment, status,
  reply, replied_at, created_at, updated_at,
  reviewer:users!reviews_reviewer_id_fkey(id, full_name, avatar_path)
`;

/** Avis publiés reçus par un utilisateur. */
export async function getReviewsForUser(userId: string, limit = 20): Promise<ReviewWithAuthor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_COLUMNS)
    .eq('reviewee_id', userId)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<Omit<ReviewWithAuthor, 'reviewerAvatarUrl'>[]>();

  if (error) {
    logger.error('Chargement des avis impossible', error, { userId });
    return [];
  }

  return (data ?? []).map((review) => ({
    ...review,
    reviewerAvatarUrl: getAvatarUrl(review.reviewer?.avatar_path),
  }));
}

/**
 * L'utilisateur courant peut-il évaluer ce vendeur pour cette annonce ?
 * Sert à n'afficher le formulaire d'avis que lorsqu'il aboutira.
 */
export async function canReview(
  reviewerId: string,
  revieweeId: string,
  adId: string | null,
): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('can_review', {
    p_reviewer: reviewerId,
    p_reviewee: revieweeId,
    p_ad_id: adId,
  });

  if (error) {
    logger.error('Vérification can_review impossible', error);
    return false;
  }
  return Boolean(data);
}
