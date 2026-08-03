'use client';

/**
 * Historique local, pour les visiteurs non connectés.
 *
 * Sur une plateforme d'annonces, la majorité des visites se font sans compte :
 * réserver les recherches récentes aux personnes connectées reviendrait à
 * priver la plupart des gens de la fonctionnalité. Le stockage local comble ce
 * vide, et présente deux avantages qu'il ne faut pas sous-estimer :
 *
 *  - **aucune donnée ne quitte l'appareil** — pas de journal côté serveur de ce
 *    qu'un visiteur anonyme a cherché ;
 *  - **aucun aller-retour réseau** — l'affichage est instantané, ce qui compte
 *    sur une connexion mobile lente.
 *
 * En contrepartie l'historique ne suit pas d'un appareil à l'autre. C'est le
 * bon compromis pour quelqu'un qui n'a pas de compte : il n'a de toute façon
 * rien à synchroniser.
 *
 * Une fois connecté, c'est l'historique serveur qui fait foi et celui-ci n'est
 * plus alimenté — sans quoi deux listes divergentes s'afficheraient.
 */
import { useCallback, useEffect, useState } from 'react';

const MAX_ENTRIES = 12;

export interface LocalSearch {
  query: string;
  at: number;
}

export interface LocalView {
  id: string;
  title: string;
  href: string;
  at: number;
}

type Kind = 'searches' | 'views';

const KEYS: Record<Kind, string> = {
  searches: 'ikassa:recherches',
  views: 'ikassa:consultees',
};

function read<T>(kind: Kind): T[] {
  try {
    const raw = localStorage.getItem(KEYS[kind]);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    // Stockage refusé ou contenu corrompu : on repart d'une liste vide plutôt
    // que de faire échouer le rendu.
    return [];
  }
}

function write<T>(kind: Kind, entries: T[]): void {
  try {
    localStorage.setItem(KEYS[kind], JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Quota atteint ou navigation privée verrouillée : sans effet.
  }
}

export interface LocalHistory<T> {
  entries: T[];
  /** Ajoute en tête, en dédoublonnant. */
  push: (entry: T) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/**
 * @param kind      Quel historique.
 * @param disabled  `true` quand l'utilisateur est connecté : le serveur prend
 *                  alors le relais, et écrire ici créerait deux listes.
 */
export function useLocalHistory<T extends LocalSearch | LocalView>(
  kind: Kind,
  disabled = false,
): LocalHistory<T> {
  const [entries, setEntries] = useState<T[]>([]);

  // Lecture après montage : `localStorage` n'existe pas au rendu serveur, et
  // initialiser l'état avec son contenu provoquerait une erreur d'hydratation.
  useEffect(() => {
    if (disabled) return;
    setEntries(read<T>(kind));
  }, [kind, disabled]);

  const push = useCallback(
    (entry: T) => {
      if (disabled) return;

      setEntries((previous) => {
        const key = 'id' in entry ? entry.id : entry.query.toLocaleLowerCase('fr').trim();
        const withoutDuplicate = previous.filter((item) =>
          'id' in item ? item.id !== key : item.query.toLocaleLowerCase('fr').trim() !== key,
        );
        const next = [entry, ...withoutDuplicate].slice(0, MAX_ENTRIES);
        write(kind, next);
        return next;
      });
    },
    [kind, disabled],
  );

  const remove = useCallback(
    (id: string) => {
      setEntries((previous) => {
        const next = previous.filter((item) => ('id' in item ? item.id !== id : item.query !== id));
        write(kind, next);
        return next;
      });
    },
    [kind],
  );

  const clear = useCallback(() => {
    setEntries([]);
    write(kind, []);
  }, [kind]);

  return { entries, push, remove, clear };
}
