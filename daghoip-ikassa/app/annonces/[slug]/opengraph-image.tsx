/**
 * Aperçu de partage d'une annonce.
 *
 * C'est l'image qui s'affiche dans une conversation WhatsApp quand quelqu'un
 * envoie le lien — de très loin le premier canal de partage au Gabon. Elle
 * porte donc ce qui décide d'un clic : la photo, le titre, le prix, la ville.
 *
 * Rendue à la demande puis mise en cache par la couche HTTP. Une annonce dont
 * le titre ou le prix change produira une image différente au prochain partage,
 * ce qui est le comportement attendu.
 */
import { getAdImageUrl } from '@/services/storage.service';
import { getAdByReference } from '@/services/ads.service';
import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '@/lib/seo/og';
import { SITE } from '@/utils/constants';
import { formatListingPrice } from '@/utils/format';
import { extractReference } from '@/utils/slug';

export const alt = `Annonce sur ${SITE.name}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const reference = extractReference(slug);
  const listing = reference ? await getAdByReference(reference) : null;

  // Annonce introuvable ou retirée : on rend tout de même une carte propre.
  // Une image cassée dans une conversation est pire qu'une image générique.
  if (!listing) {
    return renderOgCard({
      title: 'Cette annonce n’est plus disponible',
      subtitle: 'Découvrez les annonces en ligne sur Daghoip Ikassa',
    });
  }

  const location = listing.district
    ? `${listing.district}, ${listing.city}`
    : `${listing.city}, Gabon`;

  return renderOgCard({
    title: listing.title,
    highlight: formatListingPrice(listing.price, listing.price_type),
    subtitle: location,
    imageUrl: getAdImageUrl(listing.images[0]?.storage_path),
    badge: listing.seller?.is_verified ? 'Vendeur vérifié' : null,
  });
}
