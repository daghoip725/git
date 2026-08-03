'use client';

/**
 * Frontière d'erreur globale.
 * Le message technique n'est jamais affiché à l'utilisateur : seul le `digest`
 * (identifiant de corrélation généré par Next.js) est exposé pour le support.
 */
import { AlertOctagon } from 'lucide-react';
import { useEffect } from 'react';

import { Button, ButtonLink } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // En production, brancher ici votre outil de suivi d'erreurs.
    console.error('Erreur non gérée :', error);
  }, [error]);

  return (
    <div className="container-app flex max-w-lg flex-col items-center py-20 text-center">
      <span className="mb-6 flex size-20 items-center justify-center rounded-full bg-red-50 text-red-700">
        <AlertOctagon className="size-10" aria-hidden="true" />
      </span>

      <h1 className="text-2xl font-extrabold text-brand-900">Une erreur est survenue</h1>
      <p className="mt-2 text-neutral-600">
        Nous n’avons pas pu afficher cette page. Réessayez dans un instant ; si le problème
        persiste, contactez-nous.
      </p>

      {error.digest ? (
        <p className="mt-3 font-mono text-xs text-neutral-500">Référence : {error.digest}</p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button type="button" size="lg" onClick={reset}>
          Réessayer
        </Button>
        <ButtonLink href="/" variant="outline" size="lg">
          Retour à l’accueil
        </ButtonLink>
      </div>
    </div>
  );
}
