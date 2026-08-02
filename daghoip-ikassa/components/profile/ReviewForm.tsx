'use client';

/**
 * Dépôt d'un avis sur un vendeur.
 *
 * Le formulaire n'apparaît que si `can_review()` a déjà répondu oui côté
 * serveur — inutile de proposer une action que la base refusera. Mais c'est
 * bien la politique RLS qui tranche : elle réexécute `can_review()` à
 * l'insertion, donc un avis forgé sans mise en relation préalable est rejeté
 * quoi qu'affiche l'interface.
 */
import { Star } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { createReviewAction } from '@/app/actions/reviews.actions';
import { RatingInput } from '@/components/profile/RatingStars';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { ActionResult } from '@/types';

export interface ReviewFormProps {
  revieweeId: string;
  revieweeName: string;
}

const COMMENT_MAX = 1000;

export function ReviewForm({ revieweeId, revieweeName }: ReviewFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    createReviewAction,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      setIsOpen(false);
      setComment('');
      router.refresh();
    }
  }, [router, state]);

  if (!isOpen) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-4">
        <p className="text-sm text-neutral-700">
          Vous avez échangé avec {revieweeName}. Votre avis aide les prochains acheteurs.
        </p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setIsOpen(true)}>
          <Star className="size-4" aria-hidden="true" />
          Laisser un avis
        </Button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4"
    >
      <h3 className="font-bold text-brand-900">Évaluer {revieweeName}</h3>

      <input type="hidden" name="revieweeId" value={revieweeId} />

      <RatingInput name="rating" disabled={isPending} />
      {state?.success === false && state.fieldErrors?.rating ? (
        <p role="alert" className="text-xs font-medium text-red-600">
          {state.fieldErrors.rating[0]}
        </p>
      ) : null}

      <div>
        <label htmlFor="review-comment" className="text-sm font-medium text-neutral-800">
          Votre commentaire (facultatif)
        </label>
        <textarea
          id="review-comment"
          name="comment"
          rows={4}
          maxLength={COMMENT_MAX}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Décrivez votre expérience : accueil, conformité de l’article, ponctualité…"
          className="mt-1.5 w-full resize-y rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
        />
        <p className="mt-1 text-right text-xs text-neutral-400" aria-live="polite">
          {comment.length} / {COMMENT_MAX}
        </p>
      </div>

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" isLoading={isPending}>
          Publier mon avis
        </Button>
        <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={isPending}>
          Annuler
        </Button>
      </div>

      <p className="text-xs text-neutral-500">
        Un avis est public et associé à votre nom. Restez factuel : les propos injurieux sont
        retirés par la modération.
      </p>
    </form>
  );
}
