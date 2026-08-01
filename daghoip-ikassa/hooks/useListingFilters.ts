'use client';

/**
 * Synchronise les filtres de recherche avec l'URL (`?q=…&ville=…`).
 *
 * L'URL reste la source de vérité : la page est un Server Component qui relit
 * `searchParams`, ce qui rend la recherche partageable et indexable.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useTransition } from 'react';

/** Correspondance entre clés d'URL (françaises) et filtres applicatifs. */
export const FILTER_PARAMS = {
  query: 'q',
  categorySlug: 'categorie',
  city: 'ville',
  province: 'province',
  minPrice: 'prix_min',
  maxPrice: 'prix_max',
  condition: 'etat',
  priceType: 'type_prix',
  sort: 'tri',
  page: 'page',
} as const;

export type FilterKey = keyof typeof FILTER_PARAMS;

export interface UseListingFiltersResult {
  values: Partial<Record<FilterKey, string>>;
  isPending: boolean;
  activeCount: number;
  setFilter: (key: FilterKey, value: string | null) => void;
  setFilters: (updates: Partial<Record<FilterKey, string | null>>) => void;
  reset: () => void;
}

export function useListingFilters(): UseListingFiltersResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const values = useMemo(() => {
    const result: Partial<Record<FilterKey, string>> = {};
    for (const [key, param] of Object.entries(FILTER_PARAMS) as [FilterKey, string][]) {
      const value = searchParams.get(param);
      if (value) result[key] = value;
    }
    return result;
  }, [searchParams]);

  const activeCount = useMemo(
    () =>
      (Object.keys(values) as FilterKey[]).filter(
        (key) => key !== 'page' && key !== 'sort' && key !== 'query',
      ).length,
    [values],
  );

  const push = useCallback(
    (params: URLSearchParams) => {
      const queryString = params.toString();
      startTransition(() => {
        router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const setFilters = useCallback(
    (updates: Partial<Record<FilterKey, string | null>>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates) as [FilterKey, string | null][]) {
        const param = FILTER_PARAMS[key];
        if (value === null || value === '') params.delete(param);
        else params.set(param, value);
      }

      // Tout changement de filtre ramène à la première page.
      if (!('page' in updates)) params.delete(FILTER_PARAMS.page);

      push(params);
    },
    [push, searchParams],
  );

  const setFilter = useCallback(
    (key: FilterKey, value: string | null) => setFilters({ [key]: value }),
    [setFilters],
  );

  const reset = useCallback(() => push(new URLSearchParams()), [push]);

  return { values, isPending, activeCount, setFilter, setFilters, reset };
}
