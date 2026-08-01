import { Eye, Heart, ListOrdered, MessageSquare, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getAdQuota, getFavoriteAdIds, getMyAds } from '@/services/ads.service';
import { getActiveSubscription } from '@/services/billing.service';
import { countUnreadMessages } from '@/services/conversations.service';
import { getMyProfile } from '@/services/users.service';
import { AD_STATUS_LABELS } from '@/utils/constants';
import { formatPrice } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Mon compte',
  robots: { index: false, follow: false },
};

export default async function AccountDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte');

  const [profile, ads, favoriteIds, unread, quota, subscription] = await Promise.all([
    getMyProfile(),
    getMyAds(user.id),
    getFavoriteAdIds(user.id),
    countUnreadMessages(user.id),
    getAdQuota(user.id),
    getActiveSubscription(user.id),
  ]);

  // Les compteurs proviennent des colonnes dénormalisées : aucune agrégation
  // supplémentaire côté base.
  const published = ads.filter((ad) => ad.status === 'published').length;
  const totalViews = ads.reduce((sum, ad) => sum + ad.views_count, 0);

  const cards = [
    { label: 'Annonces en ligne', value: published, icon: ListOrdered, href: '/compte/annonces' },
    { label: 'Vues cumulées', value: totalViews, icon: Eye, href: '/compte/annonces' },
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

      {/* --------------------------- Offre en cours --------------------------- */}
      <section
        aria-labelledby="plan-title"
        className="rounded-xl border border-neutral-200 bg-white p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="plan-title" className="font-bold text-brand-900">
              Votre offre
            </h2>
            <p className="mt-1 text-sm text-neutral-600">
              {subscription?.plan
                ? `${subscription.plan.name} — ${formatPrice(subscription.plan.price)} / ${
                    subscription.plan.billing_interval === 'yearly' ? 'an' : 'mois'
                  }`
                : 'Offre gratuite'}
            </p>
          </div>
          <Badge tone={subscription ? 'gold' : 'neutral'}>
            {published} / {quota} annonces en ligne
          </Badge>
        </div>

        {published >= quota ? (
          <p className="mt-3 text-sm text-amber-700">
            Vous avez atteint le quota de votre offre. Passez à une offre supérieure pour publier
            davantage d’annonces simultanément.
          </p>
        ) : null}
      </section>

      {/* ------------------------ Dernières annonces ------------------------- */}
      <section aria-labelledby="recent-ads-title">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id="recent-ads-title" className="text-lg font-bold text-brand-900">
            Vos dernières annonces
          </h2>
          <Link
            href="/compte/annonces"
            className="text-sm font-semibold text-brand-700 underline underline-offset-2"
          >
            Tout gérer
          </Link>
        </div>

        {ads.length > 0 ? (
          <ul className="space-y-3">
            {ads.slice(0, 4).map((ad) => (
              <li key={ad.id} className="rounded-xl border border-neutral-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/compte/annonces/${ad.id}/modifier`}
                    className="font-semibold text-brand-900 hover:text-brand-700"
                  >
                    {ad.title}
                  </Link>
                  <Badge tone={ad.status === 'published' ? 'success' : 'neutral'}>
                    {AD_STATUS_LABELS[ad.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {ad.views_count} vue{ad.views_count > 1 ? 's' : ''} · {ad.favorites_count} favori
                  {ad.favorites_count > 1 ? 's' : ''}
                </p>
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
