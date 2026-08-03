'use client';

/**
 * Recherche instantanée : champ, filtres, tri et résultats.
 *
 * La page reste un Server Component qui rend la **première page** de résultats
 * — pour le référencement, et pour qu'un visiteur sans JavaScript voie quand
 * même des annonces. Ce composant reprend ces résultats tels quels puis prend
 * la main : à partir de là, tout se joue dans le navigateur.
 */
import { Loader2, Search, X } from 'lucide-react';
import { useId } from 'react';

import { EmptyState } from '@/components/common/EmptyState';
import { ListingFilters } from '@/components/listings/ListingFilters';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useInstantSearch } from '@/hooks/useInstantSearch';
import { useSearchRecorder } from '@/hooks/useSearchRecorder';
import type { AdCardData, AdFilters, AdSort, Category, Paginated } from '@/types';
import { cn } from '@/utils/cn';

export interface SearchExperienceProps {
  categories: Category[];
  initialFilters: AdFilters;
  initialResult: Paginated<AdCardData>;
  favoriteIds: string[];
  isAuthenticated: boolean;
}

const SORT_OPTIONS: { value: AdSort; label: string }[] = [
  { value: 'recent', label: 'Plus récentes' },
  { value: 'price_asc', label: 'Moins cher' },
  { value: 'price_desc', label: 'Plus cher' },
  { value: 'popular', label: 'Popularité' },
];

/**
 * « Pertinence » n'a de sens qu'avec du texte à classer : l'option n'apparaît
 * que dans ce cas, et devient alors le tri par défaut — chercher « canapé » et
 * obtenir les annonces les plus récentes plutôt que les plus proches du terme
 * serait déroutant.
 */
const RELEVANCE_OPTION = { value: 'relevance', label: 'Pertinence' } as const;

export function SearchExperience({
  categories,
  initialFilters,
  initialResult,
  favoriteIds,
  isAuthenticated,
}: SearchExperienceProps) {
  const inputId = useId();
  const { recordSearch } = useSearchRecorder(isAuthenticated);
  const {
    filters,
    items,
    total,
    isSearching,
    isLoadingMore,
    hasMore,
    error,
    activeFilterCount,
    setFilter,
    setFilters,
    resetFilters,
    loadMore,
  } = useInstantSearch({
    initialFilters,
    initialResult,
    onSearchCompleted: recordSearch,
  });

  const favorites = new Set(favoriteIds);
  const hasQuery = Boolean(filters.query?.trim());

  return (
    <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div className="lg:sticky lg:top-32 lg:self-start">
        <ListingFilters
          categories={categories}
          filters={filters}
          activeCount={activeFilterCount}
          onChange={setFilter}
          onChangeMany={setFilters}
          onReset={resetFilters}
        />
      </div>

      <div className="min-w-0">
        {/* ----------------------- Champ et tri ----------------------- */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <label htmlFor={inputId} className="sr-only">
              Rechercher une annonce
            </label>
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-neutral-500"
              aria-hidden="true"
            />
            <input
              id={inputId}
              type="search"
              value={filters.query ?? ''}
              onChange={(event) => setFilter('query', event.target.value || null)}
              placeholder="Que recherchez-vous ?"
              autoComplete="off"
              // Le bouton d'effacement natif de `type="search"` ferait doublon
              // avec le nôtre : deux croix côte à côte dans le même champ.
              className="h-11 w-full appearance-none rounded-lg border border-neutral-300 bg-card pr-20 pl-10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
              {isSearching ? (
                <Loader2
                  className="size-4 animate-spin text-brand-600"
                  aria-hidden="true"
                  data-testid="search-spinner"
                />
              ) : null}
              {filters.query ? (
                <button
                  type="button"
                  onClick={() => setFilter('query', null)}
                  aria-label="Effacer la recherche"
                  className="rounded-full p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>

          <label className="flex shrink-0 items-center gap-2 text-sm text-neutral-600">
            <span className="hidden sm:inline">Trier par</span>
            <select
              value={filters.sort ?? (hasQuery ? 'relevance' : 'recent')}
              onChange={(event) => setFilter('sort', event.target.value as AdSort)}
              aria-label="Trier les annonces"
              className="h-11 rounded-lg border border-neutral-300 bg-card px-3 text-sm text-neutral-800 focus:border-brand-500 focus:outline-none"
            >
              {(hasQuery ? [RELEVANCE_OPTION, ...SORT_OPTIONS] : SORT_OPTIONS).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ----------------------- Compteur ----------------------- */}
        <p className="mb-4 text-sm text-neutral-600" role="status" aria-live="polite">
          {total.toLocaleString('fr-GA')} annonce{total > 1 ? 's' : ''}
          {filters.city ? ` à ${filters.city}` : ''}
          {filters.district ? `, ${filters.district}` : ''}
          {filters.radiusKm ? ` à moins de ${filters.radiusKm} km` : ''}
        </p>

        {error ? (
          <Alert tone="error" className="mb-4">
            {error}
          </Alert>
        ) : null}

        {/* ----------------------- Résultats ----------------------- */}
        {items.length > 0 ? (
          <>
            {/* L'opacité pendant une recherche évite le clignotement d'une
                grille vidée puis remplie : les résultats précédents restent
                lisibles jusqu'à l'arrivée des nouveaux. */}
            <div className={cn('transition-opacity', isSearching && 'opacity-50')}>
              <ListingGrid
                listings={items}
                favoriteIds={favorites}
                isAuthenticated={isAuthenticated}
              />
            </div>

            {hasMore ? (
              <div className="mt-8 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={loadMore}
                  isLoading={isLoadingMore}
                >
                  Voir plus d’annonces
                </Button>
              </div>
            ) : (
              <p className="mt-8 text-center text-sm text-neutral-500">
                {items.length > 1
                  ? `Vous avez vu les ${items.length.toLocaleString('fr-GA')} annonces correspondant à votre recherche.`
                  : 'Une seule annonce correspond à votre recherche.'}
              </p>
            )}
          </>
        ) : isSearching ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Recherche en cours…
          </p>
        ) : (
          <EmptyState
            title="Aucune annonce ne correspond à votre recherche"
            description="Essayez d’élargir vos critères : une autre ville, une autre catégorie ou une fourchette de prix plus large."
            action={
              activeFilterCount > 0 || filters.query ? (
                <Button
                  type="button"
                  onClick={() => {
                    resetFilters();
                    setFilter('query', null);
                  }}
                >
                  Repartir de zéro
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
