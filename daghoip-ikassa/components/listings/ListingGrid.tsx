import { ListingCard } from '@/components/listings/ListingCard';
import type { AdCardData } from '@/types';
import { cn } from '@/utils/cn';

export interface ListingGridProps {
  listings: AdCardData[];
  favoriteIds?: Set<string>;
  isAuthenticated?: boolean;
  /** Nombre de cartes chargées en priorité (au-dessus de la ligne de flottaison). */
  priorityCount?: number;
  className?: string;
}

/** Grille responsive : 2 → 3 → 4 colonnes. */
export function ListingGrid({
  listings,
  favoriteIds,
  isAuthenticated = false,
  priorityCount = 4,
  className,
}: ListingGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4', className)}>
      {listings.map((listing, index) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          isFavorite={favoriteIds?.has(listing.id) ?? false}
          isAuthenticated={isAuthenticated}
          priority={index < priorityCount}
        />
      ))}
    </div>
  );
}
