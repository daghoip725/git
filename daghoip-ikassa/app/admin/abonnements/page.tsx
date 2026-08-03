import { CreditCard } from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { requireRole } from '@/lib/auth/roles';
import { getAdminSubscriptions } from '@/services/admin.service';
import type { SubscriptionStatus } from '@/types';
import { formatLongDate, formatPrice } from '@/utils/format';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: 'Essai',
  active: 'Actif',
  past_due: 'Impayé',
  cancelled: 'Résilié',
  expired: 'Expiré',
};

const STATUS_TONES: Record<SubscriptionStatus, 'brand' | 'gold' | 'neutral' | 'danger'> = {
  trialing: 'gold',
  active: 'brand',
  past_due: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
};

export default async function AdminSubscriptionsPage({ searchParams }: PageProps) {
  await requireRole('moderator');

  const params = await searchParams;
  const raw = Array.isArray(params.statut) ? params.statut[0] : params.statut;
  const status = raw && raw in STATUS_LABELS ? (raw as SubscriptionStatus) : undefined;

  const subscriptions = await getAdminSubscriptions({ status, limit: 100 });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-brand-900">Abonnements</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Consultation seule. Un abonnement naît d’un paiement abouti et se termine par la tâche
          planifiée <code className="text-xs">expire_subscriptions</code> ; les tarifs et quotas se
          règlent dans{' '}
          <Link href="/admin/parametres" className="font-semibold underline underline-offset-2">
            Paramètres
          </Link>
          .
        </p>
      </div>

      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-1.5">
        <Link
          href="/admin/abonnements"
          aria-current={!status ? 'page' : undefined}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
            !status
              ? 'border-brand-800 bg-brand-700 text-white'
              : 'border-neutral-300 text-neutral-700 hover:border-brand-500'
          }`}
        >
          Tous
        </Link>
        {(Object.keys(STATUS_LABELS) as SubscriptionStatus[]).map((value) => (
          <Link
            key={value}
            href={`/admin/abonnements?statut=${value}`}
            aria-current={status === value ? 'page' : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
              status === value
                ? 'border-brand-800 bg-brand-700 text-white'
                : 'border-neutral-300 text-neutral-700 hover:border-brand-500'
            }`}
          >
            {STATUS_LABELS[value]}
          </Link>
        ))}
      </nav>

      <p className="text-sm text-neutral-600" role="status">
        {subscriptions.length} abonnement{subscriptions.length > 1 ? 's' : ''}
      </p>

      {subscriptions.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-card">
          <table className="w-full min-w-160 text-sm">
            <caption className="sr-only">Liste des abonnements</caption>
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Compte
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Offre
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  Prix
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Statut
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Période en cours
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Renouvellement
                </th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((subscription) => (
                <tr key={subscription.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2.5">
                    {subscription.user ? (
                      <Link
                        href={`/vendeurs/${subscription.user.id}`}
                        className="text-brand-800 hover:underline"
                      >
                        {subscription.user.full_name}
                      </Link>
                    ) : (
                      <span className="text-neutral-500">Compte supprimé</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700">{subscription.plan?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right text-neutral-900 tabular-nums">
                    {subscription.plan ? formatPrice(subscription.plan.price) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONES[subscription.status]}>
                      {STATUS_LABELS[subscription.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {formatLongDate(subscription.current_period_start)} →{' '}
                    {formatLongDate(subscription.current_period_end)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {subscription.cancel_at_period_end
                      ? 'Arrêt en fin de période'
                      : subscription.auto_renew
                        ? 'Automatique'
                        : 'Manuel'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={CreditCard}
          title="Aucun abonnement"
          description="Les abonnements apparaîtront ici dès la première souscription."
        />
      )}
    </div>
  );
}
