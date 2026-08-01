/**
 * Génération d'identifiants lisibles pour les URLs (`/annonces/<slug>-<ref>`).
 */

/**
 * Convertit un texte libre en slug URL-safe.
 * Les accents français sont décomposés puis retirés (`Ngounié` -> `ngounie`).
 */
export function slugify(input: string, maxLength = 70): string {
  const slug = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length <= maxLength) return slug || 'annonce';
  return slug.slice(0, maxLength).replace(/-+[^-]*$/, '') || 'annonce';
}

/**
 * Extrait la référence courte accolée à un slug d'annonce.
 * `velo-vtt-libreville-DI7F3K2A` -> `DI7F3K2A`
 */
export function extractReference(slugWithReference: string): string | null {
  const match = slugWithReference.match(/-([A-Z0-9]{8})$/i);
  return match?.[1] ? match[1].toUpperCase() : null;
}

/** Construit l'URL canonique d'une annonce. */
export function buildListingHref(slug: string, reference: string): string {
  return `/annonces/${slug}-${reference.toUpperCase()}`;
}
