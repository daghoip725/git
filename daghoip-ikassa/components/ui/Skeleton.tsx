import { cn } from '@/utils/cn';

export interface SkeletonProps {
  className?: string;
}

/** Bloc de chargement générique (voir la classe `.skeleton` dans globals.css). */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />;
}

/** Squelette d'une carte d'annonce, utilisé par les `loading.tsx`. */
export function ListingCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-card">
      <Skeleton className="aspect-4/3 w-full rounded-none" />
      <div className="space-y-2 p-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Grille de squelettes responsive. */
export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <ListingCardSkeleton key={index} />
      ))}
    </div>
  );
}
