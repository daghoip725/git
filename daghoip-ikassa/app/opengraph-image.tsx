/**
 * Aperçu de partage par défaut du site.
 *
 * Sert à toutes les pages qui n'en définissent pas de plus précis : accueil,
 * catégories, pages légales. Le logo carré utilisé jusqu'ici s'affichait rogné
 * dans les fils de discussion, où le format attendu est 1200×630.
 */
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '@/lib/seo/og';
import { SITE } from '@/utils/constants';

export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    title: 'Achetez et vendez partout au Gabon',
    subtitle: 'Véhicules, immobilier, téléphones, emploi, services',
    badge: 'Gratuit et sans commission',
  });
}
