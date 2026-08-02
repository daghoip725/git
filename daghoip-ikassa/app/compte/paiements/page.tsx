/**
 * Historique des paiements et abonnement en cours.
 *
 * La RLS de `payments` limite déjà la lecture au payeur : le filtre par
 * `user_id` du service est une commodité, pas la sécurité.
 */
import { CreditCard } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PaymentRow } from '@/components/payments/PaymentRow';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getActiveSubscription, getPayments } from '@/services/billing.service';
import { formatLongDate, formatPrice } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Mes paiements',
  robots: { index: false, follow: false },
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  trialing: 'Période d’essai',
  active: 'Actif',
  past_due: 'En attente de paiement',
  cancelled: 'Résilié',
  expired: 'Expiré',
};

export default async function PaymentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/paiements');

  const [payments, subscription] = await Promise.all([
    getPayments(user.id),
    getActiveSubscription(user.id),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">Paiements et abonnement</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Retrouvez ici vos règlements, leur statut et vos factures.
        </p>
      </header>

      <section
        aria-labelledby="abonnement-titre"
        className="rounded-xl border border-neutral-200 bg-white p-4 sm:p-5"
      >
        <h2 id="abonnement-titre" className="text-sm font-semibold text-neutral-800">
          Mon abonnement
        </h2>

        {subscription?.plan ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-bold text-brand-900">{subscription.plan.name}</p>
              <p className="mt-0.5 text-sm text-neutral-600">
                {formatPrice(subscription.plan.price)} ·{' '}
                {subscription.status === 'active'
                  ? `renouvellement le ${formatLongDate(subscription.current_period_end)}`
                  : `période jusqu’au ${formatLongDate(subscription.current_period_end)}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={subscription.status === 'active' ? 'success' : 'warning'}>
                {SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}
              </Badge>
              <ButtonLink href="/premium" variant="outline" size="sm">
                Changer d’offre
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              Vous êtes au plan gratuit : 5 annonces en ligne et 5 photos par annonce.
            </p>
            <ButtonLink href="/premium" size="sm">
              Découvrir Premium
            </ButtonLink>
          </div>
        )}
      </section>

      <section aria-labelledby="historique-titre" className="space-y-3">
        <h2 id="historique-titre" className="text-sm font-semibold text-neutral-800">
          Historique ({payments.length})
        </h2>

        {payments.length > 0 ? (
          <ul className="space-y-3">
            {payments.map((payment) => (
              <PaymentRow key={payment.id} payment={payment} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CreditCard}
            title="Aucun paiement pour le moment"
            description="Vos règlements d’abonnement et de mise en avant apparaîtront ici, avec leurs factures."
            action={<ButtonLink href="/premium">Voir les offres Premium</ButtonLink>}
          />
        )}
      </section>

      <p className="text-xs text-neutral-500">
        Une question sur un paiement ?{' '}
        <Link href="/contact" className="font-semibold text-brand-700 underline">
          Contactez-nous
        </Link>{' '}
        en indiquant la référence concernée.
      </p>
    </div>
  );
}
