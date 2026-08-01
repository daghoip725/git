import { ArrowRight, Sparkles } from 'lucide-react';
import Link from 'next/link';

import { CategoryGrid } from '@/components/categories/CategoryGrid';
import { EmptyState } from '@/components/common/EmptyState';
import { Hero } from '@/components/home/Hero';
import { HowItWorks } from '@/components/home/HowItWorks';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getRootCategoriesWithCounts } from '@/services/categories.service';
import { getFavoriteAdIds, getFeaturedAds, getRecentAds } from '@/services/ads.service';

/**
 * Page d'accueil.
 *
 * Rendu dynamique : la page lit la session (cookies) pour afficher l'état des
 * favoris. Les requêtes lourdes sont lancées en parallèle afin de limiter le
 * temps de réponse sur les connexions mobiles.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  const [categories, featured, recent, favoriteIds] = await Promise.all([
    getRootCategoriesWithCounts(),
    getFeaturedAds(8),
    getRecentAds(12),
    user ? getFavoriteAdIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  const isAuthenticated = Boolean(user);

  return (
    <>
      <Hero />

      {/* --------------------------- Catégories --------------------------- */}
      <section aria-labelledby="categories-title" className="container-app py-12 sm:py-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2
              id="categories-title"
              className="text-2xl font-extrabold text-brand-900 sm:text-3xl"
            >
              Explorer par catégorie
            </h2>
            <p className="mt-1 text-neutral-600">
              Trouvez rapidement ce que vous cherchez parmi nos univers.
            </p>
          </div>
          <Link
            href="/categories"
            className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800 sm:inline-flex"
          >
            Tout voir
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <CategoryGrid categories={categories} />
      </section>

      {/* ---------------------------- À la une ---------------------------- */}
      {featured.length > 0 ? (
        <section aria-labelledby="featured-title" className="bg-surface-muted py-12 sm:py-16">
          <div className="container-app">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles className="size-6 text-gold-500" aria-hidden="true" />
              <h2
                id="featured-title"
                className="text-2xl font-extrabold text-brand-900 sm:text-3xl"
              >
                Annonces à la une
              </h2>
            </div>

            <ListingGrid
              listings={featured}
              favoriteIds={favoriteIds}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </section>
      ) : null}

      {/* -------------------------- Plus récentes -------------------------- */}
      <section aria-labelledby="recent-title" className="container-app py-12 sm:py-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 id="recent-title" className="text-2xl font-extrabold text-brand-900 sm:text-3xl">
            Dernières annonces
          </h2>
          <Link
            href="/annonces"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
          >
            Voir tout
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        {recent.length > 0 ? (
          <ListingGrid
            listings={recent}
            favoriteIds={favoriteIds}
            isAuthenticated={isAuthenticated}
            priorityCount={0}
          />
        ) : (
          <EmptyState
            title="Aucune annonce pour le moment"
            description="Soyez le premier à publier une annonce sur Daghoip Ikassa."
            action={<ButtonLink href="/annonces/nouvelle">Déposer une annonce</ButtonLink>}
          />
        )}
      </section>

      <HowItWorks />
    </>
  );
}
