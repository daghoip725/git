'use client';

/**
 * Panneau de filtres de la recherche.
 * Colonne latérale sur desktop, tiroir plein écran sur mobile.
 *
 * Composant **contrôlé** : il ne lit rien de l'URL et n'écrit rien lui-même.
 * L'état vit dans `useInstantSearch`, ce qui permet aux résultats de se
 * rafraîchir sans rendu serveur et garde ce fichier limité à l'affichage.
 */
import { Loader2, MapPin, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { createClient } from '@/lib/supabase/client';
import { listDistricts } from '@/services/ads.search';
import type { AdCondition, AdFilters, Category, PriceType } from '@/types';
import { cn } from '@/utils/cn';
import {
  CONDITION_LABELS,
  GABON_CITY_NAMES,
  GABON_PROVINCES,
  PRICE_TYPE_LABELS,
} from '@/utils/constants';
import { PUBLICATION_AGES, SEARCH_RADII_KM } from '@/utils/validation';

export interface ListingFiltersProps {
  categories: Category[];
  filters: AdFilters;
  activeCount: number;
  onChange: <K extends keyof AdFilters>(key: K, value: AdFilters[K] | null) => void;
  onChangeMany: (patch: Partial<AdFilters>) => void;
  onReset: () => void;
}

const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const PRICE_TYPE_OPTIONS = Object.entries(PRICE_TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const AGE_OPTIONS = [
  { value: '1', label: 'Dernières 24 heures' },
  { value: '7', label: 'Cette semaine' },
  { value: '30', label: 'Ce mois-ci' },
  { value: '90', label: 'Ces trois derniers mois' },
] satisfies { value: `${(typeof PUBLICATION_AGES)[number]}`; label: string }[];

export function ListingFilters({
  categories,
  filters,
  activeCount,
  onChange,
  onChangeMany,
  onReset,
}: ListingFiltersProps) {
  const [open, setOpen] = useState(false);

  const rootCategories = categories.filter((category) => category.parent_id === null);

  const panel = (
    <div className="space-y-4">
      <Select
        label="Catégorie"
        options={rootCategories.map((category) => ({
          value: category.slug,
          label: category.name,
        }))}
        placeholder="Toutes les catégories"
        value={filters.categorySlug ?? ''}
        onChange={(event) => onChange('categorySlug', event.target.value || null)}
      />

      <Select
        label="Ville"
        options={GABON_CITY_NAMES.map((city) => ({ value: city, label: city }))}
        placeholder="Tout le Gabon"
        value={filters.city ?? ''}
        onChange={(event) => onChange('city', event.target.value || null)}
      />

      <DistrictFilter
        city={filters.city ?? null}
        value={filters.district ?? null}
        onChange={(district) => onChange('district', district)}
      />

      <Select
        label="Province"
        options={GABON_PROVINCES.map((province) => ({ value: province, label: province }))}
        placeholder="Toutes les provinces"
        value={filters.province ?? ''}
        onChange={(event) => onChange('province', event.target.value || null)}
      />

      <PriceRangeFilter
        min={filters.minPrice ?? null}
        max={filters.maxPrice ?? null}
        onChange={(patch) => onChangeMany(patch)}
      />

      <Select
        label="État"
        options={CONDITION_OPTIONS}
        placeholder="Tous les états"
        value={filters.condition ?? ''}
        onChange={(event) => onChange('condition', (event.target.value || null) as AdCondition)}
      />

      <Select
        label="Date de publication"
        options={AGE_OPTIONS}
        placeholder="Peu importe"
        value={filters.maxAgeDays ? String(filters.maxAgeDays) : ''}
        onChange={(event) =>
          onChange('maxAgeDays', event.target.value ? Number(event.target.value) : null)
        }
      />

      <DistanceFilter
        latitude={filters.latitude ?? null}
        longitude={filters.longitude ?? null}
        radiusKm={filters.radiusKm ?? null}
        onChange={(patch) => onChangeMany(patch)}
      />

      <Select
        label="Type de prix"
        options={PRICE_TYPE_OPTIONS}
        placeholder="Tous"
        value={filters.priceType ?? ''}
        onChange={(event) => onChange('priceType', (event.target.value || null) as PriceType)}
      />

      {activeCount > 0 ? (
        <Button type="button" variant="ghost" fullWidth onClick={onReset}>
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
        className="hidden rounded-xl border border-neutral-200 bg-card p-4 lg:block"
      >
        <h2 className="mb-4 font-bold text-brand-900">Filtrer les annonces</h2>
        {panel}
      </aside>

      {/* Tiroir mobile */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-neutral-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-2xl bg-card">
            <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-card p-4">
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
            <div className="sticky bottom-0 border-t border-neutral-200 bg-card p-4">
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

/* -------------------------------------------------------------------------- */
/*  Prix                                                                      */
/* -------------------------------------------------------------------------- */

interface PriceRangeFilterProps {
  min: number | null;
  max: number | null;
  onChange: (patch: Partial<AdFilters>) => void;
}

/**
 * Fourchette de prix. La saisie reste locale et n'est propagée qu'à la sortie
 * du champ : relancer la recherche à chaque chiffre ferait chercher « 1 »,
 * « 15 », « 150 »… avant d'arriver à « 150 000 ».
 */
function PriceRangeFilter({ min, max, onChange }: PriceRangeFilterProps) {
  const [localMin, setLocalMin] = useState(min === null ? '' : String(min));
  const [localMax, setLocalMax] = useState(max === null ? '' : String(max));

  // Réinitialisation depuis l'extérieur (bouton « Réinitialiser »).
  useEffect(() => setLocalMin(min === null ? '' : String(min)), [min]);
  useEffect(() => setLocalMax(max === null ? '' : String(max)), [max]);

  const commit = () => {
    const parsedMin = localMin.trim() === '' ? null : Number(localMin);
    const parsedMax = localMax.trim() === '' ? null : Number(localMax);
    onChange({
      minPrice: parsedMin !== null && Number.isFinite(parsedMin) ? parsedMin : undefined,
      maxPrice: parsedMax !== null && Number.isFinite(parsedMax) ? parsedMax : undefined,
    });
  };

  const inputClass =
    'h-11 w-full rounded-lg border border-neutral-300 px-3 text-sm ' +
    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none';

  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium text-neutral-800">Prix (FCFA)</legend>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Min"
          aria-label="Prix minimum"
          value={localMin}
          onChange={(event) => setLocalMin(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && commit()}
          className={inputClass}
        />
        <span className="text-neutral-500" aria-hidden="true">
          —
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          placeholder="Max"
          aria-label="Prix maximum"
          value={localMax}
          onChange={(event) => setLocalMax(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && commit()}
          className={inputClass}
        />
      </div>
      <p className="text-xs text-neutral-500">
        Appliqué lorsque vous quittez le champ ou appuyez sur Entrée.
      </p>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/*  Quartier                                                                  */
/* -------------------------------------------------------------------------- */

interface DistrictFilterProps {
  city: string | null;
  value: string | null;
  onChange: (district: string | null) => void;
}

/**
 * Quartiers réellement présents dans les annonces, chargés à la demande.
 *
 * Il n'existe pas de référentiel des quartiers du Gabon, et il serait faux d'en
 * inventer un : la liste vient donc des annonces elles-mêmes, regroupées par la
 * base sur une forme normalisée (« Nzeng-Ayong » et « nzeng ayong » comptent
 * pour un seul quartier).
 */
function DistrictFilter({ city, value, onChange }: DistrictFilterProps) {
  const [districts, setDistricts] = useState<{ district: string; adsCount: number }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    listDistricts(createClient(), city)
      .then((rows) => {
        if (!cancelled) setDistricts(rows);
      })
      .catch(() => {
        // Liste indisponible : le filtre disparaît, la recherche reste utilisable.
        if (!cancelled) setDistricts([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [city]);

  if (districts.length === 0) {
    return isLoading ? (
      <p className="flex items-center gap-2 text-sm text-neutral-500">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        Chargement des quartiers…
      </p>
    ) : null;
  }

  return (
    <Select
      label="Quartier"
      options={districts.map((row) => ({
        value: row.district,
        label: `${row.district} (${row.adsCount})`,
      }))}
      placeholder={city ? `Tout ${city}` : 'Tous les quartiers'}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Distance                                                                  */
/* -------------------------------------------------------------------------- */

interface DistanceFilterProps {
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  onChange: (patch: Partial<AdFilters>) => void;
}

/**
 * Filtre « autour de moi ».
 *
 * La position est demandée **au clic**, jamais au chargement, et ne quitte
 * jamais l'appareil autrement que comme paramètre de recherche : elle n'est ni
 * écrite dans l'URL, ni enregistrée. Elle est en outre arrondie à trois
 * décimales (~110 m), la même précision que celle des annonces — inutile
 * d'envoyer mieux que ce que la base sait comparer.
 */
function DistanceFilter({ latitude, longitude, radiusKm, onChange }: DistanceFilterProps) {
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPosition = latitude !== null && longitude !== null;

  function locate(radius: number) {
    setError(null);

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Votre navigateur ne prend pas en charge la géolocalisation.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        onChange({
          latitude: Math.round(position.coords.latitude * 1000) / 1000,
          longitude: Math.round(position.coords.longitude * 1000) / 1000,
          radiusKm: radius,
        });
      },
      (positionError) => {
        setIsLocating(false);
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? 'Accès à votre position refusé. Autorisez-le dans votre navigateur pour utiliser ce filtre.'
            : 'Position indisponible pour le moment.',
        );
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-neutral-800">Autour de moi</legend>

      <div className="flex flex-wrap gap-1.5">
        {SEARCH_RADII_KM.map((radius) => {
          const isActive = hasPosition && radiusKm === radius;
          return (
            <button
              key={radius}
              type="button"
              disabled={isLocating}
              aria-pressed={isActive}
              onClick={() =>
                isActive
                  ? onChange({ latitude: undefined, longitude: undefined, radiusKm: undefined })
                  : hasPosition
                    ? onChange({ radiusKm: radius })
                    : locate(radius)
              }
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                isActive
                  ? 'border-brand-800 bg-brand-700 text-white'
                  : 'border-neutral-300 text-neutral-700 hover:border-brand-500 hover:text-brand-800',
                isLocating && 'cursor-wait opacity-60',
              )}
            >
              {radius} km
            </button>
          );
        })}
      </div>

      {isLocating ? (
        <p className="flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Recherche de votre position…
        </p>
      ) : hasPosition && radiusKm ? (
        <p className="flex items-center gap-1.5 text-xs text-brand-800">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          Résultats à moins de {radiusKm} km de vous.
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          Votre position sert uniquement à cette recherche : elle n’est ni enregistrée, ni ajoutée
          au lien de la page.
        </p>
      )}

      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
