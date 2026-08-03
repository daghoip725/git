'use client';

/**
 * Enregistrement des recherches, côté serveur ou en local selon la session.
 *
 * Un seul point d'entrée pour les deux cas : le composant appelant n'a pas à
 * savoir où finit l'historique, seulement qu'une recherche vient d'aboutir.
 *
 * Deux garde-fous, tous deux tirés du fonctionnement de la recherche
 * instantanée :
 *
 *  1. **Rien avant d'avoir des résultats.** Le rappel est branché sur la fin
 *     d'une recherche, pas sur la frappe.
 *  2. **Pas deux fois la même.** Naviguer, changer un filtre puis revenir
 *     relance la même recherche ; la réenregistrer ferait remonter une entrée
 *     que l'utilisateur n'a pas refaite.
 */
import { useCallback, useRef } from 'react';

import { recordSearchAction } from '@/app/actions/history.actions';
import { useLocalHistory, type LocalSearch } from '@/hooks/useLocalHistory';
import type { AdFilters } from '@/types';

/** Filtres retenus dans l'historique : ceux qu'on saura réappliquer. */
const KEPT_FILTERS = ['categorySlug', 'city', 'district', 'condition', 'sort'] as const;

const URL_KEYS: Record<(typeof KEPT_FILTERS)[number], string> = {
  categorySlug: 'categorie',
  city: 'ville',
  district: 'quartier',
  condition: 'etat',
  sort: 'tri',
};

export function useSearchRecorder(isAuthenticated: boolean) {
  const local = useLocalHistory<LocalSearch>('searches', isAuthenticated);
  const lastKey = useRef<string | null>(null);

  const recordSearch = useCallback(
    (filters: AdFilters, total: number) => {
      const query = (filters.query ?? '').trim();
      // Une navigation par filtres seuls n'est pas une « recherche » qu'on
      // pourrait rejouer utilement depuis une liste de textes.
      if (query.length < 2) return;

      const key = query.toLocaleLowerCase('fr');
      if (lastKey.current === key) return;
      lastKey.current = key;

      if (!isAuthenticated) {
        local.push({ query, at: Date.now() });
        return;
      }

      const kept: Record<string, string> = {};
      for (const name of KEPT_FILTERS) {
        const value = filters[name];
        if (typeof value === 'string' && value !== '') kept[URL_KEYS[name]] = value;
      }

      // Volontairement sans `await` ni gestion d'erreur : l'historique est un
      // agrément, il ne doit jamais retarder l'affichage des résultats ni
      // afficher une erreur pour un enregistrement raté.
      void recordSearchAction({ query, filters: kept, results: total });
    },
    [isAuthenticated, local],
  );

  return { recordSearch, localSearches: local.entries, clearLocal: local.clear };
}
