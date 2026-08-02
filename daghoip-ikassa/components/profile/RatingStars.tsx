'use client';

/**
 * Étoiles de notation, en lecture ou en saisie.
 *
 * En lecture, la moyenne est rendue par un dégradé de remplissage — 4,3 sur 5
 * doit se voir comme 4,3 et non comme 4. En saisie, ce sont de vrais boutons
 * radio : la note reste choisissable au clavier et lisible par un lecteur
 * d'écran, ce qu'une rangée d'icônes cliquables ne permet pas.
 */
import { Star } from 'lucide-react';
import { useId, useState } from 'react';

import { cn } from '@/utils/cn';

const SIZES = { sm: 'size-3.5', md: 'size-4.5', lg: 'size-6' } as const;

export interface RatingStarsProps {
  /** Note affichée, de 0 à 5. */
  value: number;
  size?: keyof typeof SIZES;
  className?: string;
}

export function RatingStars({ value, size = 'md', className }: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, value));

  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${clamped.toLocaleString('fr-GA', { maximumFractionDigits: 1 })} sur 5`}
    >
      {[0, 1, 2, 3, 4].map((index) => {
        // Part de cette étoile réellement remplie, entre 0 et 1.
        const fill = Math.max(0, Math.min(1, clamped - index));
        return (
          <span key={index} className="relative inline-block">
            <Star className={cn(SIZES[size], 'text-neutral-300')} aria-hidden="true" />
            {fill > 0 ? (
              <span
                className="absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill * 100}%` }}
                aria-hidden="true"
              >
                <Star className={cn(SIZES[size], 'fill-gold-500 text-gold-500')} />
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
}

export interface RatingInputProps {
  name: string;
  defaultValue?: number;
  disabled?: boolean;
}

/** Sélecteur de note : cinq boutons radio habillés en étoiles. */
export function RatingInput({ name, defaultValue = 0, disabled }: RatingInputProps) {
  const groupId = useId();
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(0);

  const shown = preview || value;

  return (
    <fieldset disabled={disabled} onMouseLeave={() => setPreview(0)}>
      <legend className="mb-1.5 text-sm font-medium text-neutral-800">Votre note</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <label
            key={star}
            onMouseEnter={() => setPreview(star)}
            className="cursor-pointer p-0.5"
            title={`${star} étoile${star > 1 ? 's' : ''}`}
          >
            <input
              type="radio"
              name={name}
              id={`${groupId}-${star}`}
              value={star}
              checked={value === star}
              onChange={() => setValue(star)}
              className="peer sr-only"
            />
            <Star
              className={cn(
                'size-7 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700',
                star <= shown ? 'fill-gold-500 text-gold-500' : 'text-neutral-300',
              )}
              aria-hidden="true"
            />
            <span className="sr-only">
              {star} étoile{star > 1 ? 's' : ''}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
