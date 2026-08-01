'use client';

/**
 * Panneau de filtres de la recherche.
 * Colonne latérale sur desktop, tiroir plein écran sur mobile.
 */
import { SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';

import { useListingFilters } from '@/hooks/useListingFilters';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import type { Category } from '@/types';
import { cn } from '@/utils/cn';
import {
  CONDITION_LABELS,
  GABON_CITY_NAMES,
  GABON_PROVINCES,
  PRICE_TYPE_LABELS,
} from '@/utils/constants';

export interface ListingFiltersProps {
  categories: Category[];
}

const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PRICE_TYPE_OPTIONS = Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export function ListingFilters({ categories }: ListingFiltersProps) {
  const { values, activeCount, setFilter, reset, isPending } = useListingFilters();
  const [open, setOpen] = useState(false);

  const rootCategories = categories.filter((category) => category.parent_id === null);

  const panel = (
    <div className={cn('space-y-4', isPending && 'opacity-60')}>
      <Select
        label="Catégorie"
        options={rootCategories.map((category) => ({
          value: category.slug,
          label: category.name,
        }))}
        placeholder="Toutes les catégories"
        value={values.categorySlug ?? ''}
        onChange={(event) => setFilter('categorySlug', event.target.value || null)}
      />

      <Select
        label="Ville"
        options={GABON_CITY_NAMES.map((city) => ({ value: city, label: city }))}
        placeholder="Tout le Gabon"
        value={values.city ?? ''}
        onChange={(event) => setFilter('city', event.target.value || null)}
      />

      <Select
        label="Province"
        options={GABON_PROVINCES.map((province) => ({ value: province, label: province }))}
        placeholder="Toutes les provinces"
        value={values.province ?? ''}
        onChange={(event) => setFilter('province', event.target.value || null)}
      />

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-neutral-800">Prix (FCFA)</legend>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min"
            aria-label="Prix minimum"
            defaultValue={values.minPrice ?? ''}
            onBlur={(event) => setFilter('minPrice', event.target.value || null)}
            className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          />
          <span className="text-neutral-400" aria-hidden="true">
            —
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max"
            aria-label="Prix maximum"
            defaultValue={values.maxPrice ?? ''}
            onBlur={(event) => setFilter('maxPrice', event.target.value || null)}
            className="h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          />
        </div>
        <p className="text-xs text-neutral-500">
          Les valeurs sont appliquées lorsque vous quittez le champ.
        </p>
      </fieldset>

      <Select
        label="État"
        options={CONDITION_OPTIONS}
        placeholder="Tous les états"
        value={values.condition ?? ''}
        onChange={(event) => setFilter('condition', event.target.value || null)}
      />

      <Select
        label="Type de prix"
        options={PRICE_TYPE_OPTIONS}
        placeholder="Tous"
        value={values.priceType ?? ''}
        onChange={(event) => setFilter('priceType', event.target.value || null)}
      />

      {activeCount > 0 ? (
        <Button type="button" variant="ghost" fullWidth onClick={reset}>
          <X className="size-4" aria-hidden="true" />
          Réinitialiser les filtres
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      {/* Déclencheur mobile */}
      <div className="lg:hidden">
        <Button type="button" variant="outline" fullWidth onClick={() => setOpen(true)}>
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Filtrer
          {activeCount > 0 ? (
            <span className="ml-1 rounded-full bg-brand-700 px-1.5 text-xs text-white">
              {activeCount}
            </span>
          ) : null}
        </Button>
      </div>

      {/* Colonne desktop */}
      <aside
        aria-label="Filtres de recherche"
        className="hidden rounded-xl border border-neutral-200 bg-white p-4 lg:block"
      >
        <h2 className="mb-4 font-bold text-brand-900">Filtrer les annonces</h2>
        {panel}
      </aside>

      {/* Tiroir mobile */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-neutral-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-white">
            <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white p-4">
              <h2 className="font-bold text-brand-900">Filtrer les annonces</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer les filtres"
                className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="p-4">{panel}</div>
            <div className="sticky bottom-0 border-t border-neutral-200 bg-white p-4">
              <Button type="button" fullWidth size="lg" onClick={() => setOpen(false)}>
                Voir les résultats
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Sélecteur de tri, affiché au-dessus des résultats. */
export function ListingSortSelect() {
  const { values, setFilter } = useListingFilters();

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-600">
      <span className="hidden sm:inline">Trier par</span>
      <select
        value={values.sort ?? 'recent'}
        onChange={(event) => setFilter('sort', event.target.value)}
        className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-800 focus:border-brand-500 focus:outline-none"
        aria-label="Trier les annonces"
      >
        <option value="recent">Plus récentes</option>
        <option value="price_asc">Prix croissant</option>
        <option value="price_desc">Prix décroissant</option>
        <option value="popular">Plus consultées</option>
      </select>
    </label>
  );
}
