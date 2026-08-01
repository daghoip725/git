import { Clock, Flame, LayoutGrid, Sparkles } from 'lucide-react';

import { CategoryGrid } from '@/components/categories/CategoryGrid';
import { EmptyState } from '@/components/common/EmptyState';
import { Hero } from '@/components/home/Hero';
import { HowItWorks } from '@/components/home/HowItWorks';
import { PublishCTA } from '@/components/home/PublishCTA';
import { SectionHeading } from '@/components/home/SectionHeading';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import {
  getFavoriteAdIds,
  getFeaturedAds,
  getPlatformStats,
  getPopularAds,
  getRecentAds,
} from '@/services/ads.service';
import { getCategories, getRootCategoriesWithCounts } from '@/services/categories.service';

/**
 * Page d'accueil.
 *
 * Rendu dynamique : la session est lue pour afficher l'état des favoris.
 * Les huit requêtes partent en parallèle — sur une connexion mobile gabonaise,
 * c'est la latence cumulée qui coûte, pas le volume.
 */
export default async function HomePage() {
  const user = await getCurrentUser();

  const [categoriesWithCounts, allCategories, featured, popular, recent, stats, favoriteIds] =
    await Promise.all([
      getRootCategoriesWithCounts(),
      getCategories(),
      getFeaturedAds(8),
      getPopularAds(8),
      getRecentAds(12),
      getPlatformStats(),
      user ? getFavoriteAdIds(user.id) : Promise.resolve(new Set<string>()),
    ]);

  const isAuthenticated = Boolean(user);
  const isEmpty = featured.length === 0 && popular.length === 0 && recent.length === 0;

  return (
    <>
      <Hero categories={allCategories} stats={stats} />

      {/* ------------------------------ Catégories ------------------------------ */}
      <section aria-labelledby="categories-title" className="container-app section">
        <SectionHeading
          id="categories-title"
          title="Explorer par catégorie"
          description="Trouvez rapidement ce que vous cherchez parmi nos univers."
          icon={LayoutGrid}
          link={{ href: '/categories', label: 'Tout voir' }}
        />
        <CategoryGrid categories={categoriesWithCounts} scrollOnMobile />
      </section>

      {/* -------------------------- Annonces sponsorisées ----------------------- */}
      {featured.length > 0 ? (
        <section
          aria-labelledby="sponsored-title"
          className="border-y border-gold-200/60 bg-gradient-to-b from-gold-50/60 to-transparent"
        >
          <div className="container-app section">
            <SectionHeading
              id="sponsored-title"
              title="Annonces sponsorisées"
              description="Des vendeurs ont mis ces annonces en avant."
              icon={Sparkles}
              tone="gold"
              link={{ href: '/annonces?tri=recent', label: 'Voir les annonces' }}
            />
            <ListingGrid
              listings={featured}
              favoriteIds={favoriteIds}
              isAuthenticated={isAuthenticated}
              variant="sponsored"
              scrollOnMobile
            />
          </div>
        </section>
      ) : null}

      {/* --------------------------- Produits populaires ------------------------ */}
      {popular.length > 0 ? (
        <section aria-labelledby="popular-title" className="container-app section">
          <SectionHeading
            id="popular-title"
            title="Produits populaires"
            description="Les annonces les plus consultées ces derniers jours."
            icon={Flame}
            link={{ href: '/annonces?tri=popular', label: 'Tout le classement' }}
          />
          <ListingGrid
            listings={popular}
            favoriteIds={favoriteIds}
            isAuthenticated={isAuthenticated}
            priorityCount={0}
            scrollOnMobile
          />
        </section>
      ) : null}

      <PublishCTA />

      {/* ---------------------------- Annonces récentes ------------------------- */}
      <section aria-labelledby="recent-title" className="container-app section">
        <SectionHeading
          id="recent-title"
          title="Dernières annonces"
          description="Ce qui vient d’être publié partout au Gabon."
          icon={Clock}
          link={{ href: '/annonces', label: 'Voir tout' }}
        />

        {recent.length > 0 ? (
          <ListingGrid
            listings={recent}
            favoriteIds={favoriteIds}
            isAuthenticated={isAuthenticated}
            priorityCount={0}
          />
        ) : (
          <EmptyState
            title={isEmpty ? 'Aucune annonce pour le moment' : 'Aucune annonce récente'}
            description="Soyez le premier à publier une annonce sur Daghoip Ikassa."
            action={<ButtonLink href="/annonces/nouvelle">Déposer une annonce</ButtonLink>}
          />
        )}
      </section>

      <HowItWorks />
    </>
  );
}
