'use client';

/**
 * Identifiant de visite, pour les visiteurs non connectés.
 *
 * Sert à une seule chose : ne pas compter deux fois le même clic de contact
 * dans la journée. Sans lui, tous les visiteurs anonymes se confondraient en un
 * seul, et un vendeur ne verrait jamais qu'un contact par jour quel que soit le
 * nombre de personnes intéressées.
 *
 * Ce que cet identifiant n'est pas : un traceur. Il est tiré au hasard, ne
 * contient rien de la personne ni de l'appareil, ne quitte le navigateur que
 * vers notre propre serveur, et n'y est jamais stocké — la base n'en garde
 * qu'une empreinte mêlée à l'annonce et à la date, purgée au bout de sept
 * jours. Personne, nous compris, ne peut reconstituer un parcours à partir de
 * là.
 *
 * `localStorage` et non `sessionStorage` : un onglet rouvert ne doit pas
 * regonfler le compteur. En contrepartie l'identifiant survit à la visite,
 * d'où la précaution ci-dessus sur ce qu'il contient.
 */
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ikassa:visiteur';

function readOrCreate(): string | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.length >= 8) return stored;

    const fresh = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Stockage refusé (navigation privée verrouillée) : on renonce à
    // dédoublonner plutôt que d'insister. Le contact sera compté sous
    // l'identité générique « anonyme », ce qui sous-estime le chiffre — moins
    // grave que de ne rien mesurer, et bien moins intrusif qu'un repli sur une
    // empreinte de navigateur.
    return undefined;
  }
}

/**
 * Renvoie l'identifiant de visite, ou `undefined` avant l'hydratation et quand
 * le stockage local est indisponible.
 */
export function useVisitorId(): string | undefined {
  const [visitorId, setVisitorId] = useState<string>();

  // Après montage seulement : `localStorage` n'existe pas au rendu serveur, et
  // le lire pendant le rendu ferait diverger le HTML.
  useEffect(() => {
    setVisitorId(readOrCreate());
  }, []);

  return visitorId;
}
