'use client';

/**
 * Fourchette de prix des annonces comparables, sous le champ « Prix ».
 *
 * Ce n'est **pas** une estimation de la valeur de l'article : c'est ce que
 * d'autres vendeurs demandent, ni plus ni moins. La formulation le dit, et le
 * nombre d'annonces sur lequel repose le calcul est affiché — un chiffre issu de
 * six annonces ne se lit pas comme un chiffre issu de deux cents.
 *
 * Rien n'est prérempli : proposer un prix, ce serait le fixer.
 */
import { TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';

import { suggestPriceAction, type PriceSuggestion } from '@/app/actions/ai.actions';
import { formatPrice } from '@/utils/format';

const SCOPE_LABELS: Record<PriceSuggestion['scope'], string> = {
  city: 'dans votre ville',
  province: 'dans votre province',
  national: 'dans tout le Gabon',
};

export interface PriceHintProps {
  categoryId: string;
  city: string;
  condition: string | null;
}

export function PriceHint({ categoryId, city, condition }: PriceHintProps) {
  const [suggestion, setSuggestion] = useState<PriceSuggestion | null>(null);

  useEffect(() => {
    if (!categoryId) {
      setSuggestion(null);
      return;
    }

    // `cancelled` évite qu'une réponse lente à une ancienne catégorie n'écrase
    // celle de la catégorie courante.
    let cancelled = false;

    void suggestPriceAction({
      categoryId,
      city: city || undefined,
      condition: condition || undefined,
    }).then((result) => {
      if (cancelled) return;
      setSuggestion(result.success ? result.data : null);
    });

    return () => {
      cancelled = true;
    };
  }, [categoryId, city, condition]);

  if (!suggestion) return null;

  return (
    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-neutral-600">
      <TrendingUp className="mt-0.5 size-3.5 shrink-0 text-brand-800" aria-hidden="true" />
      <span>
        Annonces comparables {SCOPE_LABELS[suggestion.scope]} : la moitié se situe entre{' '}
        <strong className="font-semibold text-neutral-800">{formatPrice(suggestion.p25)}</strong> et{' '}
        <strong className="font-semibold text-neutral-800">{formatPrice(suggestion.p75)}</strong>,
        médiane à{' '}
        <strong className="font-semibold text-neutral-800">{formatPrice(suggestion.median)}</strong>{' '}
        <span className="text-neutral-500">
          (sur {suggestion.sampleSize} annonce{suggestion.sampleSize > 1 ? 's' : ''})
        </span>
        .
      </span>
    </p>
  );
}
