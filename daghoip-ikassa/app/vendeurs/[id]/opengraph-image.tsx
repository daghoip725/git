/**
 * Aperçu de partage d'une fiche vendeur.
 *
 * Utile surtout aux commerçants, qui diffusent le lien de leur profil plutôt
 * que celui d'une annonce en particulier — sur WhatsApp Business, en signature,
 * sur une carte de visite.
 */
import { z } from 'zod';

import { OG_CONTENT_TYPE, OG_SIZE, renderOgCard } from '@/lib/seo/og';
import { getPublicUser } from '@/services/users.service';
import { getAvatarUrl } from '@/services/storage.service';
import { SITE } from '@/utils/constants';

export const alt = `Vendeur sur ${SITE.name}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = z.string().uuid().safeParse(id);
  const seller = parsed.success ? await getPublicUser(parsed.data) : null;

  if (!seller) {
    return renderOgCard({
      title: 'Ce profil n’est plus disponible',
      subtitle: 'Découvrez les vendeurs de Daghoip Ikassa',
    });
  }

  const adsLabel = `${seller.ads_count} annonce${seller.ads_count > 1 ? 's' : ''}`;
  // La note ne s'affiche qu'à partir de trois avis : une moyenne sur un seul
  // avis n'informe pas, elle donne une fausse assurance.
  const rating =
    seller.rating_count >= 3
      ? `${seller.rating_average.toFixed(1)}/5 · ${seller.rating_count} avis`
      : null;

  return renderOgCard({
    title: seller.business_name ?? seller.full_name,
    highlight: adsLabel,
    subtitle: [seller.city, rating].filter(Boolean).join(' · ') || 'Gabon',
    imageUrl: getAvatarUrl(seller.avatar_path),
    badge: seller.is_verified ? 'Vendeur vérifié' : null,
  });
}
