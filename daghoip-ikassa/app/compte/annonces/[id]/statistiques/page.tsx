/**
 * Performances d'une annonce.
 *
 * Ce que la page cherche à dire, dans cet ordre : combien de personnes ont vu
 * l'annonce, combien l'ont mise de côté, combien ont décroché leur téléphone —
 * puis comment cela évolue jour après jour, et enfin comment l'annonce se
 * situe face aux autres de sa catégorie.
 *
 * Le taux de contact est mis en avant plutôt que le nombre de vues. Mille vues
 * sans un seul appel n'est pas un succès, c'est un prix mal placé ou une photo
 * qui n'inspire pas confiance ; c'est cela qu'un vendeur peut corriger.
 *
 * La comparaison à la catégorie utilise la **médiane** et non la moyenne : sur
 * un catalogue d'annonces, quelques annonces virales tirent toute moyenne vers
 * le haut et donneraient à la plupart des vendeurs l'impression, fausse, d'être
 * en échec.
 */
import { BarChart3, Eye, Heart, MessagesSquare, PhoneCall } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { BarList } from '@/components/charts/BarList';
import { StatTile } from '@/components/charts/StatTile';
import { TrendChart } from '@/components/charts/TrendChart';
import { Alert } from '@/components/ui/Alert';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getAdDailySeries, getAdPerformance } from '@/services/stats.service';
import { formatLongDate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

export const metadata: Metadata = {
  title: 'Performances de l’annonce',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Fenêtre d'observation : assez longue pour lisser, assez courte pour agir. */
const WINDOW_DAYS = 30;

export default async function AdStatsPage({ params }: PageProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=/compte/annonces/${id}/statistiques`);

  const supabase = await createClient();
  const { data: ad } = await supabase
    .from('ads')
    .select('id, title, slug, reference, status, seller_id')
    .eq('id', id)
    .maybeSingle();

  // La vraie barrière est dans `ad_performance()`, qui refuse une annonce
  // qui n'est pas à l'appelant. Ce contrôle évite seulement d'afficher un
  // squelette de page avant ce refus.
  if (!ad || ad.seller_id !== user.id) notFound();

  const [performance, series] = await Promise.all([
    getAdPerformance(id),
    getAdDailySeries(id, WINDOW_DAYS),
  ]);

  if (!performance) notFound();

  const periodViews = series.reduce((total, day) => total + day.views, 0);
  const periodContacts = series.reduce((total, day) => total + day.contacts, 0);

  /*
   * Comparaison à la catégorie. Deux barres seulement, mais c'est exactement le
   * cas où une barre vaut mieux qu'un chiffre : « 240 contre 180 » demande un
   * calcul mental, deux barres se lisent d'un coup d'œil.
   */
  const comparison = [
    { label: 'Cette annonce', value: performance.views },
    { label: 'Médiane de la catégorie', value: performance.categoryMedianViews },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-neutral-500">
          <Link href="/compte/annonces" className="font-semibold text-brand-800 hover:underline">
            Mes annonces
          </Link>
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-brand-900">
          <BarChart3 className="size-6 text-brand-600" aria-hidden="true" />
          Performances
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          <Link
            href={buildListingHref(ad.slug, ad.reference)}
            className="font-semibold hover:underline"
          >
            {ad.title}
          </Link>
          {performance.publishedAt ? (
            <> — en ligne depuis le {formatLongDate(performance.publishedAt)}</>
          ) : null}
        </p>
      </header>

      {ad.status !== 'published' ? (
        <Alert tone="info" title="Cette annonce n’est plus en ligne">
          Les chiffres ci-dessous restent consultables, mais ils ne bougeront plus tant que
          l’annonce n’est pas republiée.
        </Alert>
      ) : null}

      <section aria-label="Indicateurs" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Vues"
          value={performance.views}
          icon={Eye}
          hint={`${periodViews.toLocaleString('fr-GA')} sur ${WINDOW_DAYS} jours`}
        />
        <StatTile
          label="Contacts"
          value={performance.contacts}
          icon={PhoneCall}
          hint={`${periodContacts.toLocaleString('fr-GA')} sur ${WINDOW_DAYS} jours`}
        />
        <StatTile label="Favoris" value={performance.favorites} icon={Heart} />
        <StatTile label="Messages" value={performance.messages} icon={MessagesSquare} />
      </section>

      <section
        aria-label="Taux de contact"
        className="rounded-xl border border-neutral-200 bg-card p-4"
      >
        <h2 className="text-sm font-semibold text-neutral-800">Taux de contact</h2>
        <p className="mt-1 text-3xl font-extrabold text-brand-900 tabular-nums">
          {performance.contactRate.toLocaleString('fr-GA', { maximumFractionDigits: 1 })} %
        </p>
        <p className="mt-2 text-sm text-neutral-600">
          {contactRateAdvice(performance.contactRate, performance.views)}
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title={`Vues (${WINDOW_DAYS} derniers jours)`}
          points={series.map((day) => ({ day: day.day, value: day.views }))}
          summary={`${periodViews.toLocaleString('fr-GA')} au total`}
        />
        <TrendChart
          title={`Contacts (${WINDOW_DAYS} derniers jours)`}
          points={series.map((day) => ({ day: day.day, value: day.contacts }))}
          summary={`${periodContacts.toLocaleString('fr-GA')} au total`}
          color="var(--color-gold-600)"
        />
      </div>

      <BarList
        title="Vues, face aux autres annonces de la catégorie"
        items={comparison}
        emptyLabel="Pas encore assez d’annonces dans cette catégorie pour comparer."
      />

      <p className="text-xs text-neutral-500">
        Les contacts sont comptés une fois par personne et par jour, tous canaux confondus
        (téléphone, WhatsApp, message). Aucune information permettant d’identifier un visiteur n’est
        conservée.
      </p>
    </div>
  );
}

/**
 * Conseil attaché au taux de contact.
 *
 * Un pourcentage seul ne dit pas quoi en faire. Les seuils sont volontairement
 * larges : ils orientent, ils ne prétendent pas mesurer. Et sous une trentaine
 * de vues on ne conclut rien — un taux calculé sur cinq visites n'a aucune
 * valeur, et l'annoncer comme un résultat serait trompeur.
 */
function contactRateAdvice(rate: number, views: number): string {
  if (views < 30) {
    return 'Encore trop peu de vues pour en tirer une conclusion. Revenez quand l’annonce aura été vue une trentaine de fois.';
  }
  if (rate >= 5) {
    return 'Excellent : votre annonce donne envie de vous joindre. Répondez vite, c’est là que la vente se joue.';
  }
  if (rate >= 2) {
    return 'Bon niveau. Des photos supplémentaires et une description plus précise font souvent la différence.';
  }
  return 'Beaucoup de vues, peu de contacts : le prix ou les photos freinent sans doute. Comparez avec les annonces similaires de votre catégorie.';
}
