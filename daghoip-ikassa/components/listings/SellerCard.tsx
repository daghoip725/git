import { BadgeCheck, Briefcase, CalendarDays } from 'lucide-react';
import Link from 'next/link';

import { Avatar } from '@/components/common/Avatar';
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
      className="rounded-xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-start gap-3">
        <Avatar name={seller.full_name} src={getAvatarUrl(seller.avatar_path)} size={52} />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-bold text-brand-900">
            <span className="truncate">{seller.full_name}</span>
            {seller.is_verified ? (
              <BadgeCheck
                className="size-4.5 shrink-0 text-brand-600"
                aria-label="Compte vérifié"
              />
            ) : null}
          </p>

          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            Membre depuis {formatLongDate(seller.created_at)}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {seller.is_professional ? (
              <Badge tone="gold">
                <Briefcase className="size-3" aria-hidden="true" />
                Professionnel
              </Badge>
            ) : null}
            <Badge tone="neutral">
              {listingsCount} annonce{listingsCount > 1 ? 's' : ''} en ligne
            </Badge>
          </div>
        </div>
      </div>

      <Link
        href={`/annonces?vendeur=${seller.id}`}
        className="mt-3 inline-block text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800"
      >
        Voir toutes ses annonces
      </Link>
    </section>
  );
}
