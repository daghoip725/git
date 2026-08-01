import { Plus, ShieldCheck, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { SearchBar } from '@/components/layout/SearchBar';
import { ButtonLink } from '@/components/ui/Button';
import type { Category, PlatformStats } from '@/types';
import { formatCompactNumber } from '@/utils/format';
import { SITE } from '@/utils/constants';

/** Recherches fréquentes au Gabon, proposées en accès direct. */
const POPULAR_SEARCHES = [
  { label: 'Voitures', href: '/annonces?categorie=vehicules' },
  { label: 'Location Libreville', href: '/annonces?categorie=immobilier&ville=Libreville' },
  { label: 'iPhone', href: '/annonces?q=iphone' },
  { label: 'Terrain', href: '/annonces?categorie=terrains' },
  { label: 'Emploi', href: '/annonces?categorie=emploi' },
];

export interface HeroProps {
  categories: Category[];
  stats: PlatformStats | null;
}

/**
 * Bandeau d'accueil : proposition de valeur, recherche et preuves d'usage.
 *
 * Les chiffres proviennent de la vue matérialisée `platform_stats` (rafraîchie
 * toutes les 15 minutes) : les afficher ne coûte qu'une lecture d'une ligne.
 * Aucun chiffre n'est inventé — la section disparaît si la vue est vide.
 */
export function Hero({ categories, stats }: HeroProps) {
  const figures = stats
    ? [
        { value: formatCompactNumber(stats.published_ads), label: 'annonces en ligne' },
        { value: formatCompactNumber(stats.active_users), label: 'membres actifs' },
        { value: String(stats.covered_cities), label: 'villes couvertes' },
      ]
    : [];

  return (
    <section className="bg-brand-gradient relative isolate overflow-hidden">
      {/* Décor : grille discrète et halos aux couleurs de la marque. */}
      <div className="bg-grid-faint pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 -right-24 size-96 rounded-full bg-gold-500/15 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-32 size-[28rem] rounded-full bg-brand-400/25 blur-3xl"
      />

      <div className="container-app relative py-14 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-gold-300 uppercase ring-1 ring-white/15 ring-inset">
            <TrendingUp className="size-3.5" aria-hidden="true" />
            {SITE.tagline}
          </p>

          <h1 className="mt-5 text-3xl leading-[1.1] font-extrabold text-balance text-white sm:text-5xl lg:text-6xl">
            Achetez et vendez
            <span className="text-gold-gradient block">partout au Gabon</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-base text-balance text-white/75 sm:text-lg">
            Des milliers d’annonces à Libreville, Port-Gentil, Franceville et dans les neuf
            provinces. Publiez gratuitement, sans commission.
          </p>

          {/* ------------------------------ Recherche ------------------------------ */}
          <div className="mt-8">
            <Suspense fallback={<div className="h-14 rounded-2xl bg-white/15" />}>
              <SearchBar size="lg" categories={categories} />
            </Suspense>
          </div>

          {/* -------------------------- Recherches fréquentes ---------------------- */}
          <ul className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <li className="text-xs font-medium text-white/50">Populaire :</li>
            {POPULAR_SEARCHES.map((item) => (
              <li key={item.label}>
                <Link
                  href={item.href}
                  className="inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85 ring-1 ring-white/10 transition-colors ring-inset hover:bg-white/20 hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {/* --------------------------------- CTA --------------------------------- */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink
              href="/annonces/nouvelle"
              variant="gold"
              size="lg"
              className="w-full sm:w-auto"
            >
              <Plus className="size-5" aria-hidden="true" />
              Déposer une annonce gratuite
            </ButtonLink>
            <ButtonLink
              href="/annonces"
              variant="outline"
              size="lg"
              className="w-full border-white/30 text-white hover:bg-white/10 sm:w-auto"
            >
              Parcourir les annonces
            </ButtonLink>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-sm text-white/60">
            <ShieldCheck className="size-4.5 text-gold-400" aria-hidden="true" />
            Transactions en direct, sans intermédiaire ni commission.
          </p>
        </div>

        {/* ------------------------------ Chiffres clés ---------------------------- */}
        {figures.length > 0 ? (
          <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-3 gap-4 border-t border-white/10 pt-8">
            {figures.map((figure) => (
              <div key={figure.label} className="text-center">
                <dt className="sr-only">{figure.label}</dt>
                <dd>
                  <span className="block text-2xl font-extrabold text-white sm:text-3xl">
                    {figure.value}
                  </span>
                  <span className="mt-0.5 block text-xs text-white/60 sm:text-sm">
                    {figure.label}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </section>
  );
}
