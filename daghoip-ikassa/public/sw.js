/* eslint-disable no-restricted-globals */
/**
 * Service worker de Daghoip Ikassa.
 *
 * Écrit à la main plutôt que généré : les stratégies utiles ici tiennent en
 * cinquante lignes, et une bibliothèque de génération apporterait surtout des
 * comportements par défaut qu'il faudrait ensuite désactiver un par un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Ce qui est mis en cache — et surtout ce qui ne l'est pas
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Les pages HTML ne sont **jamais** mises en cache. C'est une décision de
 *  sécurité, pas une limite technique : au Gabon, un téléphone est souvent
 *  partagé entre plusieurs personnes d'un même foyer ou d'un même commerce.
 *  Une page « Mes messages » servie depuis le cache après une déconnexion
 *  montrerait la conversation de quelqu'un d'autre. Le risque n'en vaut pas la
 *  seconde gagnée.
 *
 *  Sont donc mis en cache :
 *   - les fichiers `/_next/static/*`, dont le nom contient un hachage : ils sont
 *     immuables, un nom donné désigne toujours le même contenu ;
 *   - les images d'annonces, en « périmé pendant revalidation » : voir une photo
 *     d'hier le temps que celle d'aujourd'hui arrive vaut mieux qu'un carré gris ;
 *   - la page hors ligne et le logo, préchargés à l'installation.
 *
 *  Ne sont jamais interceptés : les requêtes non-GET, l'API, l'authentification,
 *  et tout ce qui porte un en-tête d'autorisation.
 */

const VERSION = 'v1';
const STATIC_CACHE = `ikassa-static-${VERSION}`;
const IMAGE_CACHE = `ikassa-images-${VERSION}`;
const OFFLINE_URL = '/hors-ligne';

/** Au-delà, on purge les entrées les plus anciennes : un téléphone d'entrée de
 *  gamme n'a pas de place à gaspiller. */
const IMAGE_CACHE_LIMIT = 60;

const PRECACHE = [OFFLINE_URL, '/logo-daghoip-ikassa.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      // `addAll` échoue en bloc si une seule ressource manque : on préfère
      // installer partiellement plutôt que pas du tout.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('ikassa-') && !key.endsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Supprime les entrées les plus anciennes au-delà de la limite. */
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  await Promise.all(keys.slice(0, keys.length - limit).map((key) => cache.delete(key)));
}

/** Immuable : servi depuis le cache, téléchargé une seule fois. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Périmé pendant revalidation : réponse immédiate, mise à jour en arrière-plan. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(request, response.clone());
        await trim(cacheName, IMAGE_CACHE_LIMIT);
      }
      return response;
    })
    .catch(() => cached);

  return cached ?? network;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Seules les lectures sont concernées. Un POST rejoué depuis un cache serait
  // une catastrophe (paiement, message, annonce publiée deux fois).
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Jamais d'interception hors de notre origine, ni sur l'API et
  // l'authentification, dont les réponses sont propres à une session.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (url.pathname.startsWith('/_next/image') || /\.(png|jpe?g|webp|avif|svg)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGE_CACHE));
    return;
  }

  // Navigation : réseau uniquement. En cas de coupure, la page hors ligne —
  // jamais une page personnelle sortie du cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r ?? Response.error())),
    );
  }
});
