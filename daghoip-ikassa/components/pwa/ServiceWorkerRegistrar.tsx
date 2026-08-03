'use client';

/**
 * Enregistrement du service worker.
 *
 * Différé après le chargement complet : enregistrer pendant l'hydratation
 * mettrait le téléchargement du worker en concurrence avec celui de la page,
 * ce qui retarde le premier affichage — exactement le contraire du but
 * recherché sur une connexion mobile lente.
 *
 * Désactivé en développement : un worker qui sert des fichiers en cache pendant
 * qu'on modifie le code fait perdre plus de temps qu'il n'en fait gagner.
 */
import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Un échec d'enregistrement n'est pas une panne : le site fonctionne
        // exactement pareil, simplement sans mode hors ligne.
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }

    window.addEventListener('load', register);
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
