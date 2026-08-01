'use client';

/**
 * Barre de recherche principale. Soumet vers `/annonces?q=…&ville=…`,
 * ce qui garde l'URL partageable et le rendu côté serveur.
 */
import { Search } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { cn } from '@/utils/cn';
import { GABON_CITY_NAMES } from '@/utils/constants';

export interface SearchBarProps {
  className?: string;
  size?: 'md' | 'lg';
  showCity?: boolean;
}

export function SearchBar({ className, size = 'md', showCity = true }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [city, setCity] = useState(searchParams.get('ville') ?? '');

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (city) params.set('ville', city);

    const queryString = params.toString();
    router.push(queryString ? `/annonces?${queryString}` : '/annonces');
  }

  const height = size === 'lg' ? 'h-13' : 'h-11';

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      className={cn(
        'flex w-full items-stretch overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-neutral-300',
        'focus-within:ring-2 focus-within:ring-brand-500',
        className,
      )}
    >
      <label htmlFor="global-search" className="sr-only">
        Rechercher une annonce
      </label>
      <input
        id="global-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Que recherchez-vous ?"
        className={cn(
          'min-w-0 flex-1 bg-transparent px-4 text-sm text-neutral-900 outline-none placeholder:text-neutral-400',
          height,
        )}
      />

      {showCity ? (
        <>
          <span className="my-2 w-px bg-neutral-200" aria-hidden="true" />
          <label htmlFor="global-search-city" className="sr-only">
            Ville
          </label>
          <select
            id="global-search-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={cn(
              'hidden max-w-40 cursor-pointer bg-transparent px-3 text-sm text-neutral-700 outline-none sm:block',
              height,
            )}
          >
            <option value="">Tout le Gabon</option>
            {GABON_CITY_NAMES.map((cityName) => (
              <option key={cityName} value={cityName}>
                {cityName}
              </option>
            ))}
          </select>
        </>
      ) : null}

      <button
        type="submit"
        className={cn(
          'flex items-center gap-2 bg-brand-700 px-4 font-semibold text-white transition-colors hover:bg-brand-800 sm:px-6',
          height,
        )}
      >
        <Search className="size-4.5" aria-hidden="true" />
        <span className="hidden sm:inline">Rechercher</span>
        <span className="sr-only sm:hidden">Rechercher</span>
      </button>
    </form>
  );
}
