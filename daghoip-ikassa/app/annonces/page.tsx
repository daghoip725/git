import type { Metadata } from 'next';

import { EmptyState } from '@/components/common/EmptyState';
import { Pagination } from '@/components/common/Pagination';
import { ListingFilters, ListingSortSelect } from '@/components/listings/ListingFilters';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCategories, getCategoryBySlug } from '@/services/categories.service';
import { getFavoriteListingIds, searchListings } from '@/services/listings.service';
import type { ListingFilters as Filters } from '@/types';
import { listingFiltersSchema } from '@/utils/validation';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Lit un paramètre d'URL en ignorant les valeurs répétées. */
function single(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result && result.trim() !== '' ? result : undefined;
}

/**
 * Convertit les paramètres d'URL (en français) en filtres validés.
 * Toute valeur non conforme est écartée par Zod plutôt que transmise à la base.
 */
async function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<Filters> {
  const parsed = listingFiltersSchema.safeParse({
    query: single(searchParams.q),
    categorySlug: single(searchParams.categorie),
    city: single(searchParams.ville),
    province: single(searchParams.province),
    minPrice: single(searchParams.prix_min),
    maxPrice: single(searchParams.prix_max),
    condition: single(searchParams.etat),
    priceType: single(searchParams.type_prix),
    sort: single(searchParams.tri) ?? 'recent',
    page: single(searchParams.page) ?? '1',
    perPage: undefined,
  });

  const base: Filters = parsed.success ? parsed.data : { sort: 'recent', page: 1 };

  // Filtre « annonces d'un vendeur » : accepté seulement si c'est un UUID.
  const sellerId = single(searchParams.vendeur);
  if (sellerId && /^[0-9a-f-]{36}$/i.test(sellerId)) base.sellerId = sellerId;

  return base;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = single(params.q);
  const categorySlug = single(params.categorie);
  const city = single(params.ville);

  const category = categorySlug ? await getCategoryBySlug(categorySlug) : null;

  const parts = [
    query ? `« ${query} »` : (category?.name ?? 'Petites annonces'),
    city ? `à ${city}` : 'au Gabon',
  ];

  return {
    title: parts.join(' '),
    description: `Découvrez ${parts.join(' ')} sur Daghoip Ikassa. Achetez et vendez en toute confiance au Gabon.`,
    // Les pages de recherche filtrées ne sont pas indexées (contenu dupliqué).
    robots: query || city ? { index: false, follow: true } : undefined,
  };
}

export default async function ListingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = await parseFilters(params);

  const user = await getCurrentUser();

  const [result, categories, favoriteIds] = await Promise.all([
    searchListings(filters),
    getCategories(),
    user ? getFavoriteListingIds(user.id) : Promise.resolve(new Set<string>()),
  ]);

  const category = filters.categorySlug ? await getCategoryBySlug(filters.categorySlug) : null;

  /** Conserve les filtres courants en changeant uniquement la page. */
  function buildHref(page: number): string {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      const flat = single(value);
      if (flat && key !== 'page') next.set(key, flat);
    }
    if (page > 1) next.set('page', String(page));
    const queryString = next.toString();
    return queryString ? `/annonces?${queryString}` : '/annonces';
  }

  const heading =
    category?.name ??
    (filters.query ? `Résultats pour « ${filters.query} »` : 'Toutes les annonces');

  return (
    <div className="container-app py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">{heading}</h1>
        <p className="mt-1 text-sm text-neutral-600" aria-live="polite">
          {result.total.toLocaleString('fr-GA')} annonce{result.total > 1 ? 's' : ''}
          {filters.city ? ` à ${filters.city}` : ''}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <ListingFilters categories={categories} />
        </div>

        <div>
          <div className="mb-4 flex items-center justify-end">
            <ListingSortSelect />
          </div>

          {result.items.length > 0 ? (
            <>
              <ListingGrid
                listings={result.items}
                favoriteIds={favoriteIds}
                isAuthenticated={Boolean(user)}
              />

              <div className="mt-10">
                <Pagination
                  page={result.page}
                  totalPages={result.totalPages}
                  buildHref={buildHref}
                />
              </div>
            </>
          ) : (
            <EmptyState
              title="Aucune annonce ne correspond à votre recherche"
              description="Essayez d’élargir vos critères : une autre ville, une autre catégorie ou une fourchette de prix plus large."
              action={<ButtonLink href="/annonces">Réinitialiser la recherche</ButtonLink>}
            />
          )}
        </div>
      </div>
    </div>
  );
}
