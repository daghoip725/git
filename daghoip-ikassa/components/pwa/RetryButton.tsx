'use client';

/**
 * Bouton « Réessayer » de la page hors ligne.
 *
 * `location.reload()` et non un `Link` vers la page courante : le routeur de
 * Next.js servirait sa propre navigation côté client sans repasser par le
 * réseau, et la page hors ligne se réafficherait telle quelle même si la
 * connexion est revenue.
 */
import { RotateCw } from 'lucide-react';

import { Button } from '@/components/ui/Button';

export function RetryButton() {
  return (
    <Button type="button" onClick={() => window.location.reload()}>
      <RotateCw className="size-4" aria-hidden="true" />
      Réessayer
    </Button>
  );
}
