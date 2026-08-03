'use client';

/**
 * Avis reçus par un vendeur, avec droit de réponse.
 *
 * La réponse n'est offerte qu'à l'évalué, et une seule fois par avis : c'est la
 * politique RLS `reviews_update_reviewee` qui l'autorise, le `GRANT UPDATE`
 * n'accordant que les colonnes `reply` et `replied_at` — un auteur d'avis ne
 * peut donc pas réécrire la réponse qu'on lui a faite.
 */
import { CornerDownRight, MessageSquareQuote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { replyToReviewAction } from '@/app/actions/reviews.actions';
import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { RatingStars } from '@/components/profile/RatingStars';
import { Button } from '@/components/ui/Button';
import type { ReviewWithAuthor } from '@/services/reviews.service';
import { formatLongDate } from '@/utils/format';

export interface ReviewListProps {
  reviews: ReviewWithAuthor[];
  /** `true` si l'utilisateur courant est la personne évaluée. */
  isReviewee: boolean;
}

export function ReviewList({ reviews, isReviewee }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareQuote}
        title="Aucun avis pour l’instant"
        description="Les avis sont laissés par les personnes ayant réellement échangé avec ce vendeur via la messagerie."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {reviews.map((review) => (
        <li key={review.id} className="rounded-xl border border-neutral-200 bg-card p-4">
          <div className="flex items-start gap-3">
            <Avatar
              name={review.reviewer?.full_name ?? 'Utilisateur'}
              src={review.reviewerAvatarUrl}
              size={40}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-brand-900">
                  {review.reviewer?.full_name ?? 'Utilisateur'}
                </span>
                <RatingStars value={review.rating} size="sm" />
                <time dateTime={review.created_at} className="text-xs text-neutral-500">
                  {formatLongDate(review.created_at)}
                </time>
              </div>

              {review.comment ? (
                // Rendu en texte brut : aucun HTML utilisateur n'est interprété.
                <p className="mt-1.5 leading-relaxed whitespace-pre-line text-neutral-700">
                  {review.comment}
                </p>
              ) : (
                <p className="mt-1.5 text-sm text-neutral-500 italic">
                  Note laissée sans commentaire.
                </p>
              )}

              {review.reply ? (
                <div className="mt-3 flex gap-2 rounded-lg bg-neutral-50 p-3">
                  <CornerDownRight
                    className="mt-0.5 size-4 shrink-0 text-neutral-500"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-neutral-600">Réponse du vendeur</p>
                    <p className="mt-0.5 leading-relaxed whitespace-pre-line text-neutral-700">
                      {review.reply}
                    </p>
                  </div>
                </div>
              ) : isReviewee ? (
                <ReplyForm reviewId={review.id} />
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReplyForm({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2"
        onClick={() => setIsOpen(true)}
      >
        <CornerDownRight className="size-4" aria-hidden="true" />
        Répondre
      </Button>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <label htmlFor={`reply-${reviewId}`} className="sr-only">
        Votre réponse
      </label>
      <textarea
        id={`reply-${reviewId}`}
        rows={3}
        maxLength={1000}
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        placeholder="Répondez avec calme : votre réponse est publique et reste attachée à l’avis."
        className="w-full resize-y rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
      />

      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          isLoading={isPending}
          disabled={reply.trim().length === 0}
          onClick={() =>
            startTransition(async () => {
              const result = await replyToReviewAction(reviewId, reply.trim());
              if (result.success) {
                setIsOpen(false);
                router.refresh();
              } else {
                setError(result.error);
              }
            })
          }
        >
          Publier ma réponse
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setIsOpen(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
