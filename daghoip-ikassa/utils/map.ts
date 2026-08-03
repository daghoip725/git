/**
 * Projection Web Mercator et découpage en tuiles.
 *
 * Ces fonctions sont pures et sans dépendance : elles suffisent à afficher une
 * carte de repérage sans embarquer de bibliothèque cartographique (Leaflet,
 * MapLibre…), qui pèserait plus lourd que tout le reste de la page pour un
 * usage qui se limite à « où est ce bien, à peu près ? ».
 *
 * Convention XYZ, identique à celle d'OpenStreetMap : au niveau de zoom `z`, le
 * monde est un carré de `2^z × 2^z` tuiles de 256 pixels.
 */

/** Côté d'une tuile, en pixels. */
export const TILE_SIZE = 256;

/** Bornes de zoom proposées : du quartier élargi à la rue. */
export const MIN_ZOOM = 11;
export const MAX_ZOOM = 17;
export const DEFAULT_ZOOM = 15;

/**
 * Latitude maximale représentable en Mercator (~85,05°).
 * Au-delà, la projection diverge ; sans intérêt pour le Gabon, mais la borne
 * évite des coordonnées de tuile infinies si une donnée aberrante passait.
 */
const MAX_LATITUDE = 85.05112878;

/** Abscisse d'une longitude, en pixels monde. */
export function lonToWorldX(longitude: number, zoom: number): number {
  return ((longitude + 180) / 360) * TILE_SIZE * 2 ** zoom;
}

/** Ordonnée d'une latitude, en pixels monde. */
export function latToWorldY(latitude: number, zoom: number): number {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  const radians = (clamped * Math.PI) / 180;
  const mercator = Math.log(Math.tan(Math.PI / 4 + radians / 2));
  return (0.5 - mercator / (2 * Math.PI)) * TILE_SIZE * 2 ** zoom;
}

/**
 * Échelle au sol, en mètres par pixel. Sert à dessiner à la bonne taille le
 * disque d'incertitude qui remplace le point exact.
 */
export function metersPerPixel(latitude: number, zoom: number): number {
  const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
  return (156543.03392 * Math.cos((clamped * Math.PI) / 180)) / 2 ** zoom;
}

/** Nombre de tuiles par côté au zoom donné. */
export function tileCount(zoom: number): number {
  return 2 ** zoom;
}

/**
 * URL d'une tuile à partir du gabarit `…/{z}/{x}/{y}.png`.
 * L'abscisse est repliée modulo le tour du monde ; une ordonnée hors bornes
 * renvoie `null`, ce qui laisse simplement un vide gris au lieu d'un 404.
 */
export function buildTileUrl(template: string, x: number, y: number, zoom: number): string | null {
  const count = tileCount(zoom);
  if (y < 0 || y >= count) return null;

  const wrappedX = ((x % count) + count) % count;
  return template
    .replace('{z}', String(zoom))
    .replace('{x}', String(wrappedX))
    .replace('{y}', String(y));
}

/** Lien vers OpenStreetMap, avec un marqueur à la position indiquée. */
export function openStreetMapLink(latitude: number, longitude: number, zoom: number): string {
  const lat = latitude.toFixed(5);
  const lon = longitude.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=${zoom}/${lat}/${lon}`;
}

/** Lien d'itinéraire universel Google Maps (ouvre l'application si installée). */
export function googleMapsLink(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}
