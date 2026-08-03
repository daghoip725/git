import { SearchX } from 'lucide-react';

import { ButtonLink } from '@/components/ui/Button';

export default function NotFound() {
  return (
    <div className="container-app flex max-w-lg flex-col items-center py-20 text-center">
      <span className="mb-6 flex size-20 items-center justify-center rounded-full bg-brand-50 text-brand-800">
        <SearchX className="size-10" aria-hidden="true" />
      </span>

      <h1 className="text-3xl font-extrabold text-brand-900">Page introuvable</h1>
      <p className="mt-2 text-neutral-600">
        La page ou l’annonce que vous cherchez n’existe plus, ou a peut-être été retirée par son
        auteur.
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/" size="lg">
          Retour à l’accueil
        </ButtonLink>
        <ButtonLink href="/annonces" variant="outline" size="lg">
          Parcourir les annonces
        </ButtonLink>
      </div>
    </div>
  );
}
