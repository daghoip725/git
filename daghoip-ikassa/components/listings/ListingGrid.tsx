import { ListingCard } from '@/components/listings/ListingCard';
import type { AdCardData } from '@/types';
import { cn } from '@/utils/cn';

export interface ListingGridProps {
  listings: AdCardData[];
  favoriteIds?: Set<string>;
  isAuthenticated?: boolean;
  /** Nombre de cartes chargées en priorité (au-dessus de la ligne de flottaison). */
  priorityCount?: number;
  /** Transmis à chaque carte : `sponsored` signale un emplacement payant. */
  variant?: 'default' | 'sponsored';
  /**
   * Sur mobile, présente les cartes en bandeau défilable plutôt qu'en grille.
   * Utile pour les rubriques secondaires de la page d'accueil, qui ne doivent
   * pas repousser le reste du contenu hors de l'écran.
   */
  scrollOnMobile?: boolean;
  className?: string;
}

/** Grille responsive : 2 → 3 → 4 colonnes. */
export function ListingGrid({
  listings,
  favoriteIds,
  isAuthenticated = false,
  priorityCount = 4,
  variant = 'default',
  scrollOnMobile = false,
  className,
}: ListingGridProps) {
  return (
    <div
      className={cn(
        scrollOnMobile
          ? 'scroll-row lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0'
          : 'grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4',
        className,
      )}
    >
      {listings.map((listing, index) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          isFavorite={favoriteIds?.has(listing.id) ?? false}
          isAuthenticated={isAuthenticated}
          priority={index < priorityCount}
          variant={variant}
        />
      ))}
    </div>
  );
}
