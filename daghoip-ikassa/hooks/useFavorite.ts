'use client';

/**
 * Gestion optimiste d'un favori.
 * L'UI bascule immédiatement puis se resynchronise sur la réponse du serveur ;
 * en cas d'échec, l'état précédent est restauré.
 */
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import { toggleFavoriteAction } from '@/app/actions/ads.actions';

export interface UseFavoriteResult {
  isFavorite: boolean;
  isPending: boolean;
  error: string | null;
  toggle: () => void;
}

export function useFavorite(
  listingId: string,
  initialIsFavorite: boolean,
  isAuthenticated: boolean,
): UseFavoriteResult {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggle = useCallback(() => {
    if (!isAuthenticated) {
      router.push(`/connexion?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const previous = isFavorite;
    setIsFavorite(!previous);
    setError(null);

    startTransition(async () => {
      const result = await toggleFavoriteAction(listingId);
      if (result.success) {
        setIsFavorite(result.data.isFavorite);
      } else {
        setIsFavorite(previous);
        setError(result.error);
      }
    });
  }, [isAuthenticated, isFavorite, listingId, router]);

  return { isFavorite, isPending, error, toggle };
}
