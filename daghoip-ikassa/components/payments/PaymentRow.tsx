'use client';

/**
 * Une ligne de l'historique des paiements.
 *
 * Composant client uniquement pour les deux actions d'un paiement en attente
 * (relancer, annuler) : le reste de la page reste rendu côté serveur.
 */
import { FileText, RotateCw, X } from 'lucide-react';
import Link from 'next/link';
import { useActionState } from 'react';

import { cancelPaymentAction, retryPaymentAction } from '@/app/actions/payments.actions';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Payment, PaymentStatus } from '@/types';
import { formatDateTime, formatPrice } from '@/utils/format';

const STATUS_LABELS: Record<PaymentStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'En attente', tone: 'warning' },
  processing: { label: 'En cours', tone: 'warning' },
  succeeded: { label: 'Réglé', tone: 'success' },
  failed: { label: 'Échoué', tone: 'danger' },
  refunded: { label: 'Remboursé', tone: 'neutral' },
  cancelled: { label: 'Annulé', tone: 'neutral' },
};

const PURPOSE_LABELS: Record<Payment['purpose'], string> = {
  subscription: 'Abonnement',
  ad_feature: 'Mise en avant d’une annonce',
  ad_boost: 'Remontée d’une annonce',
  verification: 'Vérification de compte',
  other: 'Prestation',
};

const PROVIDER_LABELS: Record<Payment['provider'], string> = {
  airtel_money: 'Airtel Money',
  moov_money: 'Moov Money',
  card: 'Carte bancaire',
  bank_transfer: 'Virement ou dépôt',
  cash: 'Espèces',
  manual: 'Saisie manuelle',
};

export function PaymentRow({ payment }: { payment: Payment }) {
  const status = STATUS_LABELS[payment.status];
  const isPending = payment.status === 'pending';

  const [cancelState, cancelAction, isCancelling] = useActionState(cancelPaymentAction, null);
  const [retryState, retryAction, isRetrying] = useActionState(retryPaymentAction, null);

  return (
    <li className="rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900">{PURPOSE_LABELS[payment.purpose]}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {PROVIDER_LABELS[payment.provider]} · {formatDateTime(payment.created_at)}
          </p>
          <p className="mt-0.5 font-mono text-xs text-neutral-500">{payment.reference}</p>
        </div>

        <div className="text-right">
          <p className="font-bold text-neutral-900 tabular-nums">{formatPrice(payment.amount)}</p>
          <Badge tone={status.tone} className="mt-1">
            {status.label}
          </Badge>
        </div>
      </div>

      {payment.failure_reason && payment.status === 'failed' ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {payment.failure_reason}
        </p>
      ) : null}

      {(cancelState?.success === false || retryState?.success === false) && (
        <p role="alert" className="mt-3 text-xs font-medium text-red-700">
          {cancelState?.success === false ? cancelState.error : null}
          {retryState?.success === false ? retryState.error : null}
        </p>
      )}

      {retryState?.success && retryState.data.kind !== 'error' ? (
        <p className="mt-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-900">
          Demande renvoyée. Confirmez-la sur votre téléphone.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {payment.status === 'succeeded' && payment.invoice_number ? (
          <Link
            href={`/compte/factures/${payment.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:underline"
          >
            <FileText className="size-4" aria-hidden="true" />
            Facture {payment.invoice_number}
          </Link>
        ) : null}

        {isPending ? (
          <>
            <form action={retryAction}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <Button type="submit" variant="outline" size="sm" isLoading={isRetrying}>
                <RotateCw className="size-4" aria-hidden="true" />
                Relancer
              </Button>
            </form>

            <form action={cancelAction}>
              <input type="hidden" name="paymentId" value={payment.id} />
              <Button type="submit" variant="ghost" size="sm" isLoading={isCancelling}>
                <X className="size-4" aria-hidden="true" />
                Annuler
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </li>
  );
}
