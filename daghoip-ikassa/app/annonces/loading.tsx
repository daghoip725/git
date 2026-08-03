import { ListingGridSkeleton, Skeleton } from '@/components/ui/Skeleton';

export default function LoadingListings() {
  return (
    <div className="container-app py-6 sm:py-8">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-2 h-4 w-32" />

      <div className="mt-6 grid gap-6 lg:grid-cols-[16rem_1fr]">
        <Skeleton className="hidden h-96 rounded-xl lg:block" />
        <ListingGridSkeleton count={12} />
      </div>
    </div>
  );
}
