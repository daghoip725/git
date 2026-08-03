/**
 * File de travail anti-fraude.
 *
 * Ce que cette page est : un **classement d'annonces à regarder**, avec la
 * raison pour laquelle chacune remonte. Ce qu'elle n'est pas : un verdict.
 * Aucune annonce n'est masquée, refusée ni signalée automatiquement — le score
 * ne fait que décider de l'ordre de lecture d'un modérateur.
 *
 * Ce choix est délibéré. Un score de règles se trompe : un vendeur honnête peut
 * brader un article pressé de partir, un commerçant peut mentionner son
 * WhatsApp par habitude. Faire porter la décision à la machine ferait payer ces
 * erreurs à des gens réels, sans recours.
 */
import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/common/EmptyState';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { requireRole } from '@/lib/auth/roles';
import { getFlaggedAds } from '@/services/moderation.service';
import { formatPrice, formatRelativeDate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

interface PageProps {
  searchParams: Promise<{ seuil?: string }>;
}

const THRESHOLDS = [30, 40, 50, 60];

/** Trois paliers de lecture, pas une échelle continue : le score n'est pas si précis. */
function scoreTone(score: number): BadgeTone {
  if (score >= 60) return 'danger';
  if (score >= 45) return 'warning';
  return 'neutral';
}

export default async function AdminFraudPage({ searchParams }: PageProps) {
  await requireRole('moderator');

  const params = await searchParams;
  const parsed = Number(params.seuil);
  const threshold = THRESHOLDS.includes(parsed) ? parsed : 40;

  const flagged = await getFlaggedAds(threshold);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-brand-900">Annonces à examiner</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Classement par faisceau d’indices, sur les annonces des 30 derniers jours. Aucune n’a été
          masquée : ce tableau ordonne la lecture, il ne tranche pas. Chaque signal est affiché avec
          sa justification pour que votre décision soit motivée.
        </p>
      </div>

      <nav aria-label="Seuil de signalement" className="flex flex-wrap gap-1.5">
        {THRESHOLDS.map((value) => (
          <Link
            key={value}
            href={`/admin/fraude?seuil=${value}`}
            aria-current={threshold === value ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              threshold === value
                ? 'border-brand-800 bg-brand-700 text-white'
                : 'border-neutral-300 text-neutral-700 hover:border-brand-500'
            }`}
          >
            Score ≥ {value}
          </Link>
        ))}
      </nav>

      {flagged.length > 0 ? (
        <ul className="space-y-3">
          {flagged.map((ad) => (
            <li key={ad.id} className="rounded-xl border border-neutral-200 bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={buildListingHref(ad.slug, ad.reference)}
                    className="font-semibold text-brand-900 hover:underline"
                  >
                    {ad.title}
                  </Link>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {ad.city} · {formatPrice(ad.price)} ·{' '}
                    <Link href={`/vendeurs/${ad.sellerId}`} className="hover:underline">
                      {ad.sellerName}
                    </Link>{' '}
                    · {formatRelativeDate(ad.createdAt)}
                  </p>
                </div>

                <Badge tone={scoreTone(ad.score)}>Score {ad.score}/100</Badge>
              </div>

              <ul className="mt-3 space-y-1.5">
                {ad.signals.map((signal) => (
                  <li key={signal.signal} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 shrink-0 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-600">
                      +{signal.weight}
                    </span>
                    <span className="text-neutral-700">{signal.detail}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-xs text-neutral-500">
                Pour agir, ouvrez l’annonce depuis{' '}
                <Link href="/admin/annonces" className="font-semibold text-brand-800 underline">
                  la modération des annonces
                </Link>
                .
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ShieldAlert}
          title="Aucune annonce au-dessus du seuil"
          description="Rien ne remonte sur les 30 derniers jours à ce niveau. Abaissez le seuil pour élargir la lecture."
        />
      )}
    </div>
  );
}
