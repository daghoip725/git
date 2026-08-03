'use client';

/**
 * Mémorise localement une annonce consultée, pour les visiteurs sans compte.
 *
 * Ne rend rien : c'est un effet de bord assumé, monté sur la page de détail.
 * Une alternative aurait été d'inscrire la visite depuis le composant serveur,
 * mais un visiteur anonyme n'a pas d'identité côté serveur — il n'y a rien où
 * l'écrire, sinon un cookie qu'on préfère éviter.
 *
 * Désactivé pour les personnes connectées : leur historique vit en base, et
 * alimenter les deux ferait diverger les listes.
 */
import { useEffect } from 'react';

import { useLocalHistory, type LocalView } from '@/hooks/useLocalHistory';

export interface LocalViewRecorderProps {
  adId: string;
  title: string;
  href: string;
  isAuthenticated: boolean;
}

export function LocalViewRecorder({ adId, title, href, isAuthenticated }: LocalViewRecorderProps) {
  const { push } = useLocalHistory<LocalView>('views', isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) return;
    push({ id: adId, title, href, at: Date.now() });
    // `push` est stable ; les autres valeurs décrivent la page courante et ne
    // changent pas sans navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adId]);

  return null;
}
