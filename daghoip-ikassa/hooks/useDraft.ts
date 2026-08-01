'use client';

/**
 * Sauvegarde locale d'un formulaire en cours de saisie.
 *
 * Au Gabon la connexion mobile se coupe volontiers au milieu d'une saisie :
 * perdre une description de 800 caractères est le meilleur moyen de perdre
 * aussi le vendeur. Le brouillon vit dans `localStorage`, uniquement sur
 * l'appareil, et n'est jamais envoyé au serveur.
 *
 * Rien de sensible n'y est écrit : l'appelant choisit ce qu'il confie au
 * brouillon (le formulaire d'annonce en exclut les photos, dont les chemins
 * pointent vers un stockage distant déjà écrit).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Délai d'inactivité avant écriture, pour ne pas écrire à chaque frappe. */
const SAVE_DELAY_MS = 800;

/** Un brouillon plus vieux que cela est ignoré puis effacé. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredDraft<T> {
  savedAt: number;
  values: T;
}

export interface UseDraftResult<T> {
  /** Brouillon retrouvé au montage, ou `null`. Stable après hydratation. */
  restored: T | null;
  /** Horodatage du brouillon retrouvé. */
  savedAt: Date | null;
  /** Efface le brouillon (après publication, ou sur refus de l'utilisateur). */
  clear: () => void;
}

export function useDraft<T>(key: string, values: T, enabled = true): UseDraftResult<T> {
  const [restored, setRestored] = useState<T | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  // Empêche la première écriture d'écraser le brouillon avant sa relecture.
  const isHydrated = useRef(false);

  // Lecture unique, après hydratation : `localStorage` n'existe pas au rendu serveur.
  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredDraft<T>;
        if (Date.now() - parsed.savedAt <= MAX_AGE_MS) {
          setRestored(parsed.values);
          setSavedAt(new Date(parsed.savedAt));
        } else {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // Quota, mode privé, JSON corrompu : un brouillon perdu n'est pas une panne.
      window.localStorage.removeItem(key);
    }
    isHydrated.current = true;
  }, [enabled, key]);

  // Écriture différée à chaque changement de valeurs.
  useEffect(() => {
    if (!enabled || !isHydrated.current) return;

    const timer = window.setTimeout(() => {
      try {
        const payload: StoredDraft<T> = { savedAt: Date.now(), values };
        window.localStorage.setItem(key, JSON.stringify(payload));
      } catch {
        // Stockage plein ou indisponible : on continue sans brouillon.
      }
    }, SAVE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, key, values]);

  const clear = useCallback(() => {
    setRestored(null);
    setSavedAt(null);
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Sans conséquence.
    }
  }, [key]);

  return { restored, savedAt, clear };
}
