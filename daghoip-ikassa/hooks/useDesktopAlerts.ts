'use client';

/**
 * Alertes système du navigateur, en complément de la cloche.
 *
 * Trois règles, toutes tirées de ce qui rend ces alertes supportables :
 *
 *  1. **Sur demande explicite.** La permission n'est réclamée qu'au clic de
 *     l'utilisateur — les navigateurs l'exigent, et c'est de toute façon la
 *     seule façon de ne pas se faire refuser d'emblée.
 *  2. **Seulement onglet caché.** Afficher une bulle système alors que la
 *     personne regarde déjà la page double l'information pour rien.
 *  3. **Jamais de contenu sensible.** Le titre suffit ; le corps d'un message
 *     s'afficherait sur un écran verrouillé, potentiellement devant quelqu'un
 *     d'autre.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'ikassa:alertes-systeme';

export type AlertPermission = 'unsupported' | 'default' | 'granted' | 'denied';

export interface DesktopAlerts {
  permission: AlertPermission;
  /** `true` si l'utilisateur a activé les alertes **et** accordé la permission. */
  enabled: boolean;
  /** Demande la permission puis active. À appeler depuis un geste utilisateur. */
  enable: () => Promise<void>;
  disable: () => void;
  /** Affiche une alerte si les conditions sont réunies. */
  notify: (title: string, url?: string | null) => void;
}

export function useDesktopAlerts(): DesktopAlerts {
  const [permission, setPermission] = useState<AlertPermission>('unsupported');
  const [wanted, setWanted] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setPermission(Notification.permission as AlertPermission);
    try {
      setWanted(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Stockage refusé : les alertes restent désactivées pour cette visite.
    }
  }, []);

  const enable = useCallback(async () => {
    if (!('Notification' in window)) return;

    const result = await Notification.requestPermission();
    setPermission(result as AlertPermission);
    if (result !== 'granted') return;

    setWanted(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Sans stockage, le réglage vaut pour la visite en cours.
    }
  }, []);

  const disable = useCallback(() => {
    setWanted(false);
    try {
      localStorage.setItem(STORAGE_KEY, '0');
    } catch {
      // Rien à faire : l'état en mémoire suffit.
    }
  }, []);

  const notify = useCallback(
    (title: string, url?: string | null) => {
      if (!wanted || permission !== 'granted') return;
      // Onglet visible : la cloche a déjà fait le travail.
      if (document.visibilityState === 'visible') return;

      try {
        const alert = new Notification(title, {
          icon: '/logo-daghoip-ikassa.png',
          badge: '/logo-daghoip-ikassa.png',
          // `tag` : une seule bulle à la fois, remplacée plutôt qu'empilée.
          tag: 'ikassa-notification',
          silent: false,
        });
        alert.onclick = () => {
          window.focus();
          if (url) window.location.href = url;
          alert.close();
        };
      } catch {
        // Certains navigateurs mobiles refusent la construction directe hors
        // service worker. On abandonne silencieusement : la cloche reste.
      }
    },
    [permission, wanted],
  );

  return { permission, enabled: wanted && permission === 'granted', enable, disable, notify };
}
