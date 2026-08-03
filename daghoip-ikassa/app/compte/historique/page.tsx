/**
 * Historiques personnels.
 *
 * Les deux listes vivent sur la même page : elles répondent à la même question
 * — « qu'est-ce que j'ai fait récemment ? » — et surtout, quelqu'un qui vient
 * effacer ses traces vient effacer **toutes** ses traces. Les séparer en deux
 * écrans obligerait à faire deux fois le chemin.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  HistoryPanels,
  type RecentSearch,
  type RecentView,
} from '@/components/account/HistoryPanels';
import { getCurrentUser } from '@/lib/supabase/server';
import { getRecentSearches, getRecentlyViewedAds } from '@/services/ads.service';

export const metadata: Metadata = {
  title: 'Mon historique',
  robots: { index: false, follow: false },
};

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/historique');

  const [searches, views] = await Promise.all([getRecentSearches(30), getRecentlyViewedAds(50)]);

  const recentSearches: RecentSearch[] = searches.map((entry) => ({
    id: entry.id,
    query: entry.query,
    filters:
      typeof entry.filters === 'object' && entry.filters !== null && !Array.isArray(entry.filters)
        ? (entry.filters as Record<string, string>)
        : {},
    resultsCount: entry.results_count,
    createdAt: entry.created_at,
  }));

  const recentViews: RecentView[] = views.map((ad) => ({
    id: ad.id,
    title: ad.title,
    slug: ad.slug,
    reference: ad.reference,
    price: ad.price,
    city: ad.city,
    viewedAt: ad.viewedAt,
    viewCount: ad.viewCount,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">Mon historique</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Vos recherches et les annonces que vous avez consultées, pour les retrouver rapidement.
        </p>
      </header>

      <HistoryPanels searches={recentSearches} views={recentViews} />
    </div>
  );
}
