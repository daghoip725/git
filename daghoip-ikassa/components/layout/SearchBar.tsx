'use client';

/**
 * Barre de recherche principale.
 *
 * Soumet vers `/annonces?q=…&categorie=…&ville=…`, ce qui garde l'URL
 * partageable et le rendu côté serveur. Les suggestions sont fournies par la
 * RPC `suggest_ads` (recherche trigramme, tolérante aux fautes de frappe),
 * appelée directement depuis le navigateur : pas d'aller-retour par le serveur
 * Next.js, et la RLS s'applique quand même.
 */
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';

import { useDebounce } from '@/hooks/useDebounce';
import { createClient } from '@/lib/supabase/client';
import type { Category } from '@/types';
import { cn } from '@/utils/cn';
import { GABON_CITY_NAMES } from '@/utils/constants';
import { buildListingHref } from '@/utils/slug';

export interface SearchBarProps {
  className?: string;
  size?: 'md' | 'lg';
  showCity?: boolean;
  /** Ajoute un sélecteur de catégorie (bandeau d'accueil). */
  categories?: Category[];
}

interface Suggestion {
  title: string;
  slug: string;
  reference: string;
}

export function SearchBar({ className, size = 'md', showCity = true, categories }: SearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const listboxId = useId();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [city, setCity] = useState(searchParams.get('ville') ?? '');
  const [category, setCategory] = useState(searchParams.get('categorie') ?? '');

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);

  // --- Suggestions ----------------------------------------------------------
  useEffect(() => {
    const term = debouncedQuery.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    // `.rpc()` renvoie un thenable, pas une vraie Promise : on l'enveloppe
    // pour disposer de `finally`.
    void (async () => {
      const { data } = await createClient().rpc('suggest_ads', { p_query: term, p_limit: 6 });
      if (cancelled) return;
      setSuggestions((data as Suggestion[] | null) ?? []);
      setActiveIndex(-1);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // --- Fermeture au clic extérieur -----------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsOpen(false);

    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (category) params.set('categorie', category);
    if (city) params.set('ville', city);

    const queryString = params.toString();
    router.push(queryString ? `/annonces?${queryString}` : '/annonces');
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const picked = suggestions[activeIndex];
      if (picked) router.push(buildListingHref(picked.slug, picked.reference));
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  }

  const height = size === 'lg' ? 'h-14' : 'h-11';

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <form
        role="search"
        onSubmit={submit}
        className={cn(
          'flex w-full items-stretch overflow-hidden rounded-xl bg-card ring-1 ring-neutral-300',
          'shadow-sm transition-shadow focus-within:ring-2 focus-within:ring-brand-500',
          size === 'lg' && 'shadow-lg shadow-black/20 sm:rounded-2xl',
        )}
      >
        {/* --------------------------- Terme recherché --------------------------- */}
        {/*
          `min-w-40` : sans plancher, le champ de saisie est le premier élément
          flexible à céder de la place aux sélecteurs voisins et disparaît
          purement et simplement dans les largeurs intermédiaires.
        */}
        <div className="relative flex min-w-40 flex-1 items-center">
          <label htmlFor="global-search" className="sr-only">
            Rechercher une annonce
          </label>
          <input
            id="global-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Que recherchez-vous ?"
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen && suggestions.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            className={cn(
              'w-full bg-transparent px-4 text-sm text-neutral-900 outline-none placeholder:text-neutral-500',
              height,
            )}
          />

          {isLoading ? (
            <Loader2
              className="absolute right-2 size-4 animate-spin text-neutral-500"
              aria-hidden="true"
            />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSuggestions([]);
              }}
              aria-label="Effacer la recherche"
              className="absolute right-1 rounded-full p-1.5 text-neutral-500 hover:text-neutral-600"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/* ------------------------------ Catégorie ------------------------------ */}
        {categories && categories.length > 0 ? (
          <>
            <span className="my-2.5 w-px bg-neutral-200" aria-hidden="true" />
            <label htmlFor="global-search-category" className="sr-only">
              Catégorie
            </label>
            <select
              id="global-search-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={cn(
                'hidden max-w-44 cursor-pointer bg-transparent px-3 text-sm text-neutral-700 outline-none md:block',
                height,
              )}
            >
              <option value="">Toutes catégories</option>
              {categories
                .filter((item) => item.parent_id === null)
                .map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.name}
                  </option>
                ))}
            </select>
          </>
        ) : null}

        {/* -------------------------------- Ville -------------------------------- */}
        {showCity ? (
          <>
            <span className="my-2.5 w-px bg-neutral-200" aria-hidden="true" />
            <label htmlFor="global-search-city" className="sr-only">
              Ville
            </label>
            <div className="relative hidden items-center sm:flex">
              <MapPin
                className="pointer-events-none absolute left-3 size-4 text-neutral-500"
                aria-hidden="true"
              />
              <select
                id="global-search-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className={cn(
                  'max-w-40 cursor-pointer bg-transparent pr-3 pl-9 text-sm text-neutral-700 outline-none',
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
            </div>
          </>
        ) : null}

        <button
          type="submit"
          className={cn(
            // `shrink-0` : le formulaire est en `overflow-hidden` ; sans cela le
            // bouton cède de la place au champ et son libellé se retrouve rogné.
            'flex shrink-0 items-center gap-2 bg-brand-700 px-4 font-semibold whitespace-nowrap text-white transition-colors hover:bg-brand-ink sm:px-6',
            height,
          )}
        >
          <Search className="size-4.5" aria-hidden="true" />
          <span className="hidden sm:inline">Rechercher</span>
          <span className="sr-only sm:hidden">Rechercher</span>
        </button>
      </form>

      {/* ----------------------------- Suggestions ----------------------------- */}
      {isOpen && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Suggestions"
          className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-neutral-200 bg-card py-1 text-left shadow-xl"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.reference} role="option" aria-selected={index === activeIndex}>
              <button
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  setIsOpen(false);
                  router.push(buildListingHref(suggestion.slug, suggestion.reference));
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-neutral-700',
                  index === activeIndex && 'bg-brand-50 text-brand-900',
                )}
              >
                <Search className="size-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
                <span className="truncate">{suggestion.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
