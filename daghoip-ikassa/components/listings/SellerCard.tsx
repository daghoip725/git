import { Briefcase, CalendarDays, Star } from 'lucide-react';
import Link from 'next/link';

import { Avatar } from '@/components/common/Avatar';
import { VerifiedBadge } from '@/components/common/VerifiedBadge';
import { getAvatarUrl } from '@/services/storage.service';
import { Badge } from '@/components/ui/Badge';
import type { PublicSeller } from '@/types';
import { formatLongDate } from '@/utils/format';

export interface SellerCardProps {
  seller: PublicSeller;
  listingsCount: number;
}

/** Encart « vendeur » affiché sur la page de détail d'une annonce. */
export function SellerCard({ seller, listingsCount }: SellerCardProps) {
  return (
    <section
      aria-label="Informations sur le vendeur"
      className="rounded-xl border border-neutral-200 bg-card p-4"
    >
      <div className="flex items-start gap-3">
        <Avatar name={seller.full_name} src={getAvatarUrl(seller.avatar_path)} size={52} />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-bold text-brand-900">
            <Link href={`/vendeurs/${seller.id}`} className="truncate hover:text-brand-800">
              {seller.full_name}
            </Link>
            {seller.is_verified ? <VerifiedBadge /> : null}
          </p>

          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Membre depuis {formatLongDate(seller.created_at)}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {seller.is_professional ? (
              <Badge tone="gold">
                <Briefcase className="size-3" aria-hidden="true" />
                {seller.business_name ?? 'Professionnel'}
              </Badge>
            ) : null}
            {seller.rating_count > 0 ? (
              <Badge tone="neutral">
                <Star className="size-3 fill-current text-gold-500" aria-hidden="true" />
                {seller.rating_average.toFixed(1)} ({seller.rating_count})
              </Badge>
            ) : null}
            <Badge tone="neutral">
              {listingsCount} annonce{listingsCount > 1 ? 's' : ''} en ligne
            </Badge>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
        <Link
          href={`/vendeurs/${seller.id}`}
          className="text-brand-800 underline underline-offset-2 hover:text-brand-800"
        >
          Voir son profil
        </Link>
        <Link
          href={`/annonces?vendeur=${seller.id}`}
          className="text-brand-800 underline underline-offset-2 hover:text-brand-800"
        >
          Toutes ses annonces
        </Link>
      </div>
    </section>
  );
}
