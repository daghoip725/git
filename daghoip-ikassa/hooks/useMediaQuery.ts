'use client';

import { useEffect, useState } from 'react';

/**
 * Suit une media query CSS. Retourne `false` au premier rendu serveur afin
 * d'éviter toute erreur d'hydratation.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

/** Points de rupture alignés sur ceux de Tailwind. */
export const useIsMobile = () => !useMediaQuery('(min-width: 768px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
