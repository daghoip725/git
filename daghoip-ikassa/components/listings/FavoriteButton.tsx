'use client';

import { Heart } from 'lucide-react';

import { useFavorite } from '@/hooks/useFavorite';
import { cn } from '@/utils/cn';

export interface FavoriteButtonProps {
  listingId: string;
  initialIsFavorite: boolean;
  isAuthenticated: boolean;
  /** `icon` pour les cartes, `full` (icône + libellé) pour la page de détail. */
  variant?: 'icon' | 'full';
  className?: string;
}

export function FavoriteButton({
  listingId,
  initialIsFavorite,
  isAuthenticated,
  variant = 'icon',
  className,
}: FavoriteButtonProps) {
  const { isFavorite, isPending, toggle } = useFavorite(
    listingId,
    initialIsFavorite,
    isAuthenticated,
  );

  const label = isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris';

  if (variant === 'full') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        aria-pressed={isFavorite}
        className={cn(
          'inline-flex h-11 items-center justify-center gap-2 rounded-lg border px-5 text-sm font-semibold transition-colors',
          isFavorite
            ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
            : 'border-neutral-300 bg-card text-neutral-700 hover:bg-neutral-50',
          isPending && 'opacity-60',
          className,
        )}
      >
        <Heart className={cn('size-4.5', isFavorite && 'fill-current')} aria-hidden="true" />
        {isFavorite ? 'En favori' : 'Ajouter aux favoris'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        // La carte entière est un lien : on neutralise la navigation.
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }}
      disabled={isPending}
      aria-label={label}
      aria-pressed={isFavorite}
      title={label}
      className={cn(
        'absolute top-2 right-2 z-10 flex size-9 items-center justify-center rounded-full',
        'bg-card/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-card',
        isPending && 'opacity-60',
        className,
      )}
    >
      <Heart
        className={cn('size-4.5', isFavorite ? 'fill-red-500 text-red-500' : 'text-neutral-600')}
        aria-hidden="true"
      />
    </button>
  );
}
