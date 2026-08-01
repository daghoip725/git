import { ListingGridSkeleton, Skeleton } from '@/components/ui/Skeleton';

/**
 * Squelette de la page d'accueil.
 *
 * Reprend la structure réelle (bandeau, catégories, deux rubriques d'annonces)
 * pour que le passage au contenu ne provoque pas de saut de mise en page.
 */
export default function LoadingHome() {
  return (
    <>
      {/* Bandeau */}
      <div className="bg-brand-gradient">
        <div className="container-app py-14 sm:py-20 lg:py-24">
          <div className="mx-auto max-w-3xl space-y-5">
            <Skeleton className="mx-auto h-6 w-48 rounded-full bg-white/15" />
            <Skeleton className="mx-auto h-12 w-full max-w-xl bg-white/15" />
            <Skeleton className="mx-auto h-5 w-full max-w-md bg-white/10" />
            <Skeleton className="h-14 w-full rounded-2xl bg-white/20" />
          </div>
        </div>
      </div>

      {/* Catégories */}
      <div className="container-app section">
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Deux rubriques d'annonces */}
      <div className="container-app section space-y-12">
        <div>
          <Skeleton className="mb-6 h-8 w-56" />
          <ListingGridSkeleton count={8} />
        </div>
        <div>
          <Skeleton className="mb-6 h-8 w-56" />
          <ListingGridSkeleton count={8} />
        </div>
      </div>
    </>
  );
}
