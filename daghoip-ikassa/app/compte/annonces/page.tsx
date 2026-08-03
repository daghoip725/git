import { Eye, Heart, MessagesSquare, PhoneCall, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ListingRow } from '@/components/account/ListingRow';
import { StatTile } from '@/components/charts/StatTile';
import { EmptyState } from '@/components/common/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getMyAds } from '@/services/ads.service';
import { getSellerPerformance } from '@/services/stats.service';

export const metadata: Metadata = {
  title: 'Mes annonces',
  robots: { index: false, follow: false },
};

export default async function MyListingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/annonces');

  const [listings, performance] = await Promise.all([getMyAds(user.id), getSellerPerformance(30)]);
  const publishedCount = listings.filter((listing) => listing.status === 'published').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-900">Mes annonces</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {listings.length} annonce{listings.length > 1 ? 's' : ''} au total, dont{' '}
            {publishedCount} en ligne.
          </p>
        </div>
        <ButtonLink href="/annonces/nouvelle" variant="gold">
          <Plus className="size-4.5" aria-hidden="true" />
          Nouvelle annonce
        </ButtonLink>
      </header>

      {/*
        Synthèse en tête, avant la liste : un vendeur qui ouvre cette page veut
        d'abord savoir si ses annonces travaillent, et seulement ensuite agir sur
        l'une d'elles. Les totaux portent sur tout l'historique, la précision sur
        les trente derniers jours — c'est la période sur laquelle on peut encore
        changer quelque chose.
      */}
      {performance && listings.length > 0 ? (
        <section aria-label="Vue d’ensemble" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            label="Vues"
            value={performance.totalViews}
            icon={Eye}
            hint={`${performance.periodViews.toLocaleString('fr-GA')} sur 30 jours`}
          />
          <StatTile
            label="Contacts"
            value={performance.totalContacts}
            icon={PhoneCall}
            hint={`${performance.periodContacts.toLocaleString('fr-GA')} sur 30 jours`}
          />
          <StatTile label="Favoris" value={performance.totalFavorites} icon={Heart} />
          <StatTile label="Messages" value={performance.totalMessages} icon={MessagesSquare} />
        </section>
      ) : null}

      {listings.length > 0 ? (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li key={listing.id}>
              <ListingRow listing={listing} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Vous n’avez pas encore d’annonce"
          description="Publiez votre première annonce gratuitement et touchez des acheteurs partout au Gabon."
          action={<ButtonLink href="/annonces/nouvelle">Déposer une annonce</ButtonLink>}
        />
      )}
    </div>
  );
}
