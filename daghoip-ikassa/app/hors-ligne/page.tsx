/**
 * Page servie par le service worker quand la connexion est coupée.
 *
 * Statique et sans aucune dépendance de données : c'est la seule page du site
 * dont le rendu ne doit rien demander au réseau, puisqu'elle s'affiche
 * précisément quand il n'y en a pas.
 */
import { WifiOff } from 'lucide-react';
import type { Metadata } from 'next';

import { ButtonLink } from '@/components/ui/Button';
import { RetryButton } from '@/components/pwa/RetryButton';

export const metadata: Metadata = {
  title: 'Hors ligne',
  robots: { index: false, follow: false },
};

/** Prérendue au build : elle doit exister dans le cache avant la coupure. */
export const dynamic = 'force-static';

export default function OfflinePage() {
  return (
    <div className="container-app flex min-h-[60vh] max-w-lg flex-col items-center justify-center py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-brand-50 text-brand-800">
        <WifiOff className="size-8" aria-hidden="true" />
      </span>

      <h1 className="mt-5 text-2xl font-extrabold text-brand-900">Vous êtes hors ligne</h1>

      <p className="mt-2 text-neutral-600">
        Impossible de joindre Daghoip Ikassa pour le moment. Vérifiez votre connexion mobile ou
        votre Wi-Fi, puis réessayez.
      </p>

      <p className="mt-4 text-sm text-neutral-500">
        Les pages déjà ouvertes restent consultables dans les onglets de votre navigateur. Vos
        annonces en cours de rédaction sont conservées sur cet appareil et vous les retrouverez au
        retour du réseau.
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <RetryButton />
        <ButtonLink href="/" variant="outline">
          Aller à l’accueil
        </ButtonLink>
      </div>
    </div>
  );
}
