'use client';

/**
 * Bouton « Imprimer ».
 *
 * Seul fragment interactif de la facture : l'isoler ici évite de basculer toute
 * la page en composant client pour un unique `window.print()`.
 */
import { Printer } from 'lucide-react';

import { Button } from '@/components/ui/Button';

export function PrintButton() {
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden="true" />
      Imprimer
    </Button>
  );
}
