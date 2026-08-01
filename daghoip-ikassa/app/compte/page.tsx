import { Eye, Heart, MessageSquare, Plus, ListOrdered } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ButtonLink } from '@/components/ui/Button';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getFavoriteListingIds, getListingsBySeller } from '@/services/listings.service';
import { countUnreadMessages } from '@/services/messages.service';
import { getMyProfile } from '@/services/profiles.service';

export const metadata: Metadata = {
  title: 'Mon compte',
  robots: { index: false, follow: false },
};

/** Statistiques du vendeur (vues cumulées, annonces en ligne). */
async function getSellerStats(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('listings')
    .select('status, views_count')
    .eq('seller_id', userId);

  const rows = data ?? [];
  return {
    total: rows.length,
    published: rows.filter((row) => row.status === 'published').length,
    views: rows.reduce((sum, row) => sum + row.views_count, 0),
  };
}

export default async function AccountDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte');

  const [profile, stats, favoriteIds, unread, recentListings] = await Promise.all([
    getMyProfile(),
    getSellerStats(user.id),
    getFavoriteListingIds(user.id),
    countUnreadMessages(user.id),
    getListingsBySeller(user.id, { includeUnpublished: true, limit: 4 }),
  ]);

  const cards = [
    {
      label: 'Annonces en ligne',
      value: stats.published,
      icon: ListOrdered,
      href: '/compte/annonces',
    },
    { label: 'Vues cumulées', value: stats.views, icon: Eye, href: '/compte/annonces' },
    { label: 'Favoris', value: favoriteIds.size, icon: Heart, href: '/compte/favoris' },
    { label: 'Messages non lus', value: unread, icon: MessageSquare, href: '/messages' },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-900">
            Bonjour {profile?.full_name.split(' ')[0] ?? ''}
          </h1>
          <p className="mt-1 text-neutral-600">Voici l’activité de vos annonces.</p>
        </div>
        <ButtonLink href="/annonces/nouvelle" variant="gold">
          <Plus className="size-4.5" aria-hidden="true" />
          Déposer une annonce
        </ButtonLink>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-300"
          >
            <card.icon className="size-5 text-brand-600" aria-hidden="true" />
            <p className="mt-2 text-2xl font-extrabold text-brand-900">
              {card.value.toLocaleString('fr-GA')}
            </p>
            <p className="text-xs text-neutral-600">{card.label}</p>
          </Link>
        ))}
      </div>

      <section aria-labelledby="recent-listings-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recent-listings-title" className="text-lg font-bold text-brand-900">
            Vos dernières annonces
          </h2>
          <Link
            href="/compte/annonces"
            className="text-sm font-semibold text-brand-700 underline underline-offset-2"
          >
            Tout gérer
          </Link>
        </div>

        {recentListings.length > 0 ? (
          <ul className="space-y-3">
            {recentListings.map((listing) => (
              <li key={listing.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <Link
                  href={`/compte/annonces/${listing.id}/modifier`}
                  className="font-semibold text-brand-900 hover:text-brand-700"
                >
                  {listing.title}
                </Link>
                <p className="mt-1 text-sm text-neutral-500">{listing.city}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-600">
            Vous n’avez pas encore publié d’annonce.
          </p>
        )}
      </section>
    </div>
  );
}
