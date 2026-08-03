import { Banknote } from 'lucide-react';
import Link from 'next/link';

import { ConfirmPaymentButton } from '@/components/admin/ConfirmPaymentButton';
import { EmptyState } from '@/components/common/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { requireRole } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/supabase/server';
import { getAdminPayments } from '@/services/admin.service';
import type { PaymentStatus } from '@/types';
import { formatDateTime, formatPrice } from '@/utils/format';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'En attente',
  processing: 'En cours',
  succeeded: 'Abouti',
  failed: 'Échoué',
  refunded: 'Remboursé',
  cancelled: 'Annulé',
};

const STATUS_TONES: Record<PaymentStatus, 'brand' | 'gold' | 'neutral' | 'danger'> = {
  pending: 'gold',
  processing: 'gold',
  succeeded: 'brand',
  failed: 'danger',
  refunded: 'neutral',
  cancelled: 'neutral',
};

const PURPOSE_LABELS: Record<string, string> = {
  subscription: 'Abonnement',
  ad_feature: 'Mise en avant',
  ad_boost: 'Remontée',
  verification: 'Vérification',
  other: 'Autre',
};

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  await requireRole('moderator');

  // Seul un administrateur peut confirmer un règlement hors ligne : créditer un
  // abonnement n'est pas de la modération. La base refuse de toute façon, ce
  // test évite seulement d'afficher un bouton qui échouerait.
  const viewer = await getCurrentUser();
  const canConfirm = viewer?.role === 'admin';

  const params = await searchParams;
  const raw = Array.isArray(params.statut) ? params.statut[0] : params.statut;
  const status = raw && raw in STATUS_LABELS ? (raw as PaymentStatus) : undefined;

  const payments = await getAdminPayments({ status, limit: 100 });
  const collected = payments
    .filter((payment) => payment.status === 'succeeded')
    .reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-brand-900">Paiements</h2>
        <p className="mt-1 text-sm text-neutral-600">
          La table n’accorde aucun droit d’écriture au client : seul le rappel signé de l’opérateur
          — rejouable sans effet — fait aboutir un paiement. Les règlements hors ligne (virement,
          espèces), qui n’émettent aucun rappel, sont confirmés ici par un administrateur, et la
          confirmation est tracée avec son identité.
        </p>
      </div>

      <nav aria-label="Filtrer par statut" className="flex flex-wrap gap-1.5">
        <Link
          href="/admin/paiements"
          aria-current={!status ? 'page' : undefined}
          className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${
            !status
              ? 'border-brand-800 bg-brand-700 text-white'
              : 'border-neutral-300 text-neutral-700 hover:border-brand-500'
          }`}
        >
          Tous
        </Link>
        {(Object.keys(STATUS_LABELS) as PaymentStatus[]).map((value) => (
          <Link
            key={value}
            href={`/admin/paiements?statut=${value}`}
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
        {payments.length} paiement{payments.length > 1 ? 's' : ''} · {formatPrice(collected)}{' '}
        encaissés sur cette sélection
      </p>

      {payments.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-card">
          <table className="w-full min-w-160 text-sm">
            <caption className="sr-only">Liste des paiements</caption>
            <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs text-neutral-600">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Référence
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Compte
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Objet
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Opérateur
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-semibold">
                  Montant
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Statut
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Date
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-2.5 font-mono text-xs text-neutral-600">
                    {payment.reference}
                  </td>
                  <td className="px-4 py-2.5">
                    {payment.user ? (
                      <Link
                        href={`/vendeurs/${payment.user.id}`}
                        className="text-brand-800 hover:underline"
                      >
                        {payment.user.full_name}
                      </Link>
                    ) : (
                      <span className="text-neutral-500">Compte supprimé</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700">
                    {PURPOSE_LABELS[payment.purpose] ?? payment.purpose}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700">{payment.provider}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-neutral-900 tabular-nums">
                    {formatPrice(payment.amount)}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={STATUS_TONES[payment.status]}>
                      {STATUS_LABELS[payment.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-500">
                    {formatDateTime(payment.paid_at ?? payment.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canConfirm &&
                    (payment.status === 'pending' || payment.status === 'processing') ? (
                      <ConfirmPaymentButton paymentId={payment.id} reference={payment.reference} />
                    ) : payment.invoice_number ? (
                      <span className="font-mono text-xs text-neutral-500">
                        {payment.invoice_number}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Banknote}
          title="Aucun paiement"
          description="Les paiements Mobile Money apparaîtront ici dès le premier encaissement."
        />
      )}
    </div>
  );
}
