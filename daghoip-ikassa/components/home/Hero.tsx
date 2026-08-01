import { Plus, ShieldCheck } from 'lucide-react';
import { Suspense } from 'react';

import { SearchBar } from '@/components/layout/SearchBar';
import { ButtonLink } from '@/components/ui/Button';
import { SITE } from '@/utils/constants';

/** Bandeau d'accueil : proposition de valeur + recherche. */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-brand-600">
      {/* Motif décoratif discret aux couleurs de la marque. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-gold-500/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-brand-400/20 blur-3xl"
      />

      <div className="container-app relative py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold tracking-[0.2em] text-gold-300 uppercase">
            {SITE.tagline}
          </p>

          <h1 className="mt-3 text-3xl leading-tight font-extrabold text-balance text-white sm:text-4xl lg:text-5xl">
            Achetez et vendez partout au Gabon
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-base text-balance text-white/80 sm:text-lg">
            Des milliers d’annonces à Libreville, Port-Gentil, Franceville et dans les neuf
            provinces. Publiez gratuitement en quelques minutes.
          </p>

          <div className="mt-8">
            <Suspense fallback={<div className="h-13 rounded-xl bg-white/20" />}>
              <SearchBar size="lg" />
            </Suspense>
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/annonces/nouvelle" variant="gold" size="lg">
              <Plus className="size-5" aria-hidden="true" />
              Déposer une annonce gratuite
            </ButtonLink>
            <ButtonLink
              href="/annonces"
              variant="outline"
              size="lg"
              className="border-white/40 text-white hover:bg-white/10"
            >
              Parcourir les annonces
            </ButtonLink>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-white/70">
            <ShieldCheck className="size-4.5 text-gold-400" aria-hidden="true" />
            Transactions en direct, sans intermédiaire ni commission.
          </p>
        </div>
      </div>
    </section>
  );
}
