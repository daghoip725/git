import { ImageOff, MapPin } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { FavoriteButton } from '@/components/listings/FavoriteButton';
import { Badge } from '@/components/ui/Badge';
import type { AdCardData } from '@/types';
import { cn } from '@/utils/cn';
import { formatListingPrice, formatRelativeDate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

export interface ListingCardProps {
  listing: AdCardData;
  isFavorite?: boolean;
  isAuthenticated?: boolean;
  /** Charge l'image en priorité (à réserver aux premières cartes visibles). */
  priority?: boolean;
  /**
   * `sponsored` distingue visuellement les emplacements payants.
   * La mention est une obligation d'information : une annonce mise en avant
   * contre paiement doit être identifiable comme telle.
   */
  variant?: 'default' | 'sponsored';
  className?: string;
}

/**
 * Carte d'annonce responsive : 2 colonnes sur mobile, jusqu'à 4 sur desktop.
 * Le rapport d'image est fixé en 4/3 pour éviter tout décalage de mise en page.
 */
export function ListingCard({
  listing,
  isFavorite = false,
  isAuthenticated = false,
  priority = false,
  variant = 'default',
  className,
}: ListingCardProps) {
  const isSponsored = variant === 'sponsored';
  const href = buildListingHref(listing.slug, listing.reference);
  const price = formatListingPrice(listing.price, listing.price_type);

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-white transition-all',
        isSponsored
          ? 'border-gold-300 shadow-[var(--shadow-gold)] hover:-translate-y-0.5'
          : 'border-neutral-200 shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)]',
        className,
      )}
    >
      <FavoriteButton
        listingId={listing.id}
        initialIsFavorite={isFavorite}
        isAuthenticated={isAuthenticated}
      />

      <Link href={href} className="block focus-visible:outline-none">
        <div className="relative aspect-4/3 overflow-hidden bg-neutral-100">
          {listing.coverImageUrl ? (
            <Image
              src={listing.coverImageUrl}
              alt={listing.title}
              fill
              priority={priority}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-neutral-300">
              <ImageOff className="size-10" aria-hidden="true" />
            </div>
          )}

          {isSponsored || listing.is_featured ? (
            <span className="absolute top-2 left-2 rounded-full bg-gold-500 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-brand-900 uppercase">
              {isSponsored ? 'Sponsorisé' : 'À la une'}
            </span>
          ) : null}
        </div>

        <div className="p-3">
          <h3 className="line-clamp-2-safe min-h-10 text-sm leading-tight font-semibold text-brand-900">
            {listing.title}
          </h3>

          <p className="mt-1.5 text-base font-extrabold text-brand-700">{price}</p>

          <div className="mt-2 flex items-center gap-1 text-xs text-neutral-500">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{listing.city}</span>
            <span aria-hidden="true">·</span>
            <time
              dateTime={listing.published_at ?? listing.created_at}
              className="shrink-0 truncate"
            >
              {formatRelativeDate(listing.published_at ?? listing.created_at)}
            </time>
          </div>

          {listing.categoryName ? (
            <Badge tone="brand" className="mt-2.5">
              {listing.categoryName}
            </Badge>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
