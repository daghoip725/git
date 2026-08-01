import { Heart } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/common/EmptyState';
import { ListingGrid } from '@/components/listings/ListingGrid';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getFavoriteListings } from '@/services/listings.service';

export const metadata: Metadata = {
  title: 'Mes favoris',
  robots: { index: false, follow: false },
};

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/favoris');

  const listings = await getFavoriteListings(user.id);
  const favoriteIds = new Set(listings.map((listing) => listing.id));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">Mes favoris</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {listings.length} annonce{listings.length > 1 ? 's' : ''} enregistrée
          {listings.length > 1 ? 's' : ''}.
        </p>
      </header>

      {listings.length > 0 ? (
        <ListingGrid listings={listings} favoriteIds={favoriteIds} isAuthenticated />
      ) : (
        <EmptyState
          icon={Heart}
          title="Aucun favori pour le moment"
          description="Cliquez sur le cœur d’une annonce pour la retrouver ici plus tard."
          action={<ButtonLink href="/annonces">Parcourir les annonces</ButtonLink>}
        />
      )}
    </div>
  );
}
