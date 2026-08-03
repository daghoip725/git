'use client';

/**
 * Recherche instantanée.
 *
 * Le serveur rend la première page ; ce hook prend ensuite la main et
 * interroge PostgreSQL **directement depuis le navigateur** (RPC `search_ads`,
 * toujours sous RLS). Chaque changement de filtre coûte donc un aller-retour
 * réseau au lieu de deux, ce qui compte sur une connexion mobile où le temps
 * perdu est de la latence, pas du calcul.
 *
 * Trois précautions dans un champ qui se met à jour à la frappe :
 *
 *  1. **Le texte est temporisé** (300 ms), les autres filtres s'appliquent
 *     immédiatement : personne n'attend après avoir cliqué sur « Libreville ».
 *  2. **Les requêtes obsolètes sont annulées** (`AbortSignal`) et un compteur
 *     de génération écarte toute réponse arrivée dans le désordre — sans quoi
 *     une réponse lente à « can » pourrait écraser les résultats de « canapé ».
 *  3. **L'URL est mise à jour sans navigation** (`history.replaceState`), pour
 *     rester partageable sans provoquer de rendu serveur à chaque frappe.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDebounce } from '@/hooks/useDebounce';
import { createClient } from '@/lib/supabase/client';
import { runSearch } from '@/services/ads.search';
import type { AdCardData, AdFilters, Paginated } from '@/types';
import { DEFAULT_PAGE_SIZE } from '@/utils/constants';

/** Correspondance entre clés d'URL (en français) et filtres applicatifs. */
export const SEARCH_PARAMS = {
  query: 'q',
  categorySlug: 'categorie',
  city: 'ville',
  province: 'province',
  district: 'quartier',
  minPrice: 'prix_min',
  maxPrice: 'prix_max',
  condition: 'etat',
  priceType: 'type_prix',
  maxAgeDays: 'depuis',
  sellerId: 'vendeur',
  sort: 'tri',
} as const;

/** Filtres qui comptent dans le badge « n filtres actifs ». */
const COUNTED_FILTERS = [
  'categorySlug',
  'city',
  'province',
  'district',
  'minPrice',
  'maxPrice',
  'condition',
  'priceType',
  'maxAgeDays',
] as const satisfies readonly (keyof AdFilters)[];

export interface UseInstantSearchOptions {
  initialFilters: AdFilters;
  initialResult: Paginated<AdCardData>;
  /**
   * Appelée après chaque recherche aboutie, avec les filtres effectifs et le
   * nombre de résultats. Sert à alimenter l'historique — le crochet lui-même
   * ne sait rien de cet historique, et n'a pas à le savoir.
   */
  onSearchCompleted?: (filters: AdFilters, total: number) => void;
}

export interface UseInstantSearchResult {
  filters: AdFilters;
  items: AdCardData[];
  total: number;
  /** Requête en cours pour un nouveau jeu de filtres. */
  isSearching: boolean;
  /** Chargement d'une page supplémentaire. */
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  activeFilterCount: number;
  /** Position accordée par le navigateur, jamais écrite dans l'URL. */
  hasPosition: boolean;
  setFilter: <K extends keyof AdFilters>(key: K, value: AdFilters[K] | null) => void;
  setFilters: (patch: Partial<AdFilters>) => void;
  resetFilters: () => void;
  loadMore: () => void;
}

/** Retire les valeurs vides pour que la comparaison de filtres reste fiable. */
function compact(filters: AdFilters): AdFilters {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === undefined || value === '') continue;
    result[key] = value;
  }
  return result as AdFilters;
}

/** Reconstruit `?q=…&ville=…` à partir des filtres, hors position GPS. */
function toSearchParams(filters: AdFilters): string {
  const params = new URLSearchParams();
  for (const [key, param] of Object.entries(SEARCH_PARAMS) as [keyof AdFilters, string][]) {
    const value = filters[key];
    if (value === null || value === undefined || value === '') continue;
    if (key === 'sort' && value === 'recent') continue;
    params.set(param, String(value));
  }
  return params.toString();
}

export function useInstantSearch({
  initialFilters,
  initialResult,
  onSearchCompleted,
}: UseInstantSearchOptions): UseInstantSearchResult {
  const [filters, setFiltersState] = useState<AdFilters>(() => compact(initialFilters));
  const [items, setItems] = useState<AdCardData[]>(initialResult.items);
  const [total, setTotal] = useState(initialResult.total);
  const [page, setPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le texte seul est temporisé ; le reste s'applique sans délai.
  const debouncedQuery = useDebounce(filters.query ?? '', 300);

  /**
   * Signature des filtres effectifs : c'est elle, et non l'objet, qui déclenche
   * une nouvelle recherche. Comparer deux chaînes évite de relancer la requête
   * à chaque rendu simplement parce qu'un objet a changé d'identité.
   */
  const signature = JSON.stringify(compact({ ...filters, query: debouncedQuery }));
  const effectiveFilters = useMemo(() => JSON.parse(signature) as AdFilters, [signature]);

  /*
   * Référence stable sur le rappel : le passer en dépendance de l'effet
   * relancerait une recherche complète chaque fois que le composant parent se
   * rend avec une nouvelle fonction fléchée.
   */
  const completedRef = useRef(onSearchCompleted);
  useEffect(() => {
    completedRef.current = onSearchCompleted;
  }, [onSearchCompleted]);

  // La première recherche est déjà rendue par le serveur : on ne la rejoue pas.
  const initialSignature = useRef(signature);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (signature === initialSignature.current) return;

    const current = ++generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setError(null);

    runSearch(
      createClient(),
      { ...(JSON.parse(signature) as AdFilters), page: 1, perPage: DEFAULT_PAGE_SIZE },
      { signal: controller.signal },
    )
      .then((result) => {
        // Réponse d'une recherche déjà remplacée : on la jette.
        if (current !== generation.current) return;
        setItems(result.items);
        setTotal(result.total);
        setPage(1);
        setIsSearching(false);
        /*
         * L'historique n'est alimenté qu'**une fois les résultats connus** :
         * le nombre de résultats fait partie de ce qu'on réaffichera
         * (« Toyota Corolla — 12 annonces »), et attendre évite d'enregistrer
         * les frappes intermédiaires que la temporisation a déjà écartées.
         */
        completedRef.current?.(JSON.parse(signature) as AdFilters, result.total);
      })
      .catch(() => {
        if (current !== generation.current || controller.signal.aborted) return;
        setError('La recherche est momentanément indisponible. Réessayez dans un instant.');
        setIsSearching(false);
      });

    return () => controller.abort();
  }, [signature]);

  // Synchronisation de l'URL, sans navigation ni rendu serveur.
  useEffect(() => {
    const queryString = toSearchParams(effectiveFilters);
    const url = queryString
      ? `${window.location.pathname}?${queryString}`
      : window.location.pathname;
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', url);
    }
  }, [effectiveFilters]);

  const loadMore = useCallback(() => {
    if (isLoadingMore || isSearching) return;

    const nextPage = page + 1;
    const current = generation.current;
    setIsLoadingMore(true);

    runSearch(createClient(), { ...effectiveFilters, page: nextPage, perPage: DEFAULT_PAGE_SIZE })
      .then((result) => {
        // Les filtres ont changé entre-temps : la page suivante ne veut plus rien dire.
        if (current !== generation.current) return;
        setItems((previous) => {
          const seen = new Set(previous.map((item) => item.id));
          return [...previous, ...result.items.filter((item) => !seen.has(item.id))];
        });
        setTotal(result.total);
        setPage(nextPage);
      })
      .catch(() => setError('Impossible de charger la suite des résultats.'))
      .finally(() => setIsLoadingMore(false));
  }, [effectiveFilters, isLoadingMore, isSearching, page]);

  const setFilters = useCallback((patch: Partial<AdFilters>) => {
    setFiltersState((previous) => compact({ ...previous, ...patch }));
  }, []);

  const setFilter = useCallback(<K extends keyof AdFilters>(key: K, value: AdFilters[K] | null) => {
    setFiltersState((previous) => {
      const next = { ...previous };
      if (value === null || value === undefined || value === '') delete next[key];
      else next[key] = value;
      // Changer de ville rend le quartier caduc : le conserver ne renverrait
      // plus rien et donnerait l'impression d'une recherche cassée.
      if (key === 'city') delete next.district;
      return compact(next);
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState((previous) => compact({ query: previous.query, sort: previous.sort }));
  }, []);

  const activeFilterCount =
    COUNTED_FILTERS.filter((key) => filters[key] !== undefined && filters[key] !== null).length +
    (filters.radiusKm ? 1 : 0);

  return {
    filters,
    items,
    total,
    isSearching,
    isLoadingMore,
    hasMore: items.length < total,
    error,
    activeFilterCount,
    hasPosition: filters.latitude !== undefined && filters.longitude !== undefined,
    setFilter,
    setFilters,
    resetFilters,
    loadMore,
  };
}
