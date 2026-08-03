'use client';

/** Fiche d'instruction d'une demande de badge vendeur vérifié. */
import { Check, ExternalLink, Loader2, X } from 'lucide-react';
import { useState, useTransition } from 'react';

import { reviewVerificationAction } from '@/app/actions/admin.actions';
import { Avatar } from '@/components/common/Avatar';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatLongDate } from '@/utils/format';
import { formatGabonPhoneNational } from '@/utils/phone';

export interface VerificationCardProps {
  request: {
    id: string;
    full_legal_name: string;
    business_name: string | null;
    business_id_number: string | null;
    contact_phone: string;
    created_at: string;
    status: string;
    rejection_reason: string | null;
    user: {
      id: string;
      full_name: string;
      city: string | null;
      ads_count: number;
      created_at: string;
    } | null;
  };
  /**
   * URLs signées des pièces, générées côté serveur et valables 5 minutes.
   * Le bucket est privé : il n'existe pas d'URL publique.
   */
  documentUrls: { label: string; url: string | null }[];
}

export function VerificationCard({ request, documentUrls }: VerificationCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const isPendingReview = request.status === 'pending';

  function review(approve: boolean, motive?: string) {
    setError(null);
    startTransition(async () => {
      const result = await reviewVerificationAction(request.id, approve, motive);
      if (!result.success) setError(result.error);
    });
  }

  return (
    <article className="rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={request.user?.full_name ?? request.full_legal_name} size={44} />

        <div className="min-w-0 flex-1">
          <p className="font-semibold text-brand-900">{request.full_legal_name}</p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Compte : {request.user?.full_name ?? '—'} ·{' '}
            {request.user?.city ?? 'Ville non renseignée'} · {request.user?.ads_count ?? 0} annonce
            {(request.user?.ads_count ?? 0) > 1 ? 's' : ''} · Membre depuis{' '}
            {request.user ? formatLongDate(request.user.created_at) : '—'}
          </p>

          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-neutral-500">Téléphone</dt>
              <dd className="font-medium text-neutral-800">
                {formatGabonPhoneNational(request.contact_phone)}
              </dd>
            </div>
            {request.business_name ? (
              <div className="flex gap-2">
                <dt className="text-neutral-500">Entreprise</dt>
                <dd className="font-medium text-neutral-800">{request.business_name}</dd>
              </div>
            ) : null}
            {request.business_id_number ? (
              <div className="flex gap-2">
                <dt className="text-neutral-500">RCCM / NIF</dt>
                <dd className="font-medium text-neutral-800">{request.business_id_number}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="text-neutral-500">Déposée le</dt>
              <dd className="font-medium text-neutral-800">{formatLongDate(request.created_at)}</dd>
            </div>
          </dl>
        </div>

        {isPending ? (
          <Loader2
            className="size-4 animate-spin self-center text-neutral-500"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* ---------------------------- Pièces jointes ---------------------------- */}
      <div className="mt-3 flex flex-wrap gap-2">
        {documentUrls.map(({ label, url }) =>
          url ? (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {label}
            </a>
          ) : (
            <Badge key={label} tone="warning">
              {label} indisponible
            </Badge>
          ),
        )}
      </div>

      {/* -------------------------------- Actions ------------------------------- */}
      {isPendingReview ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          <Button type="button" size="sm" isLoading={isPending} onClick={() => review(true)}>
            <Check className="size-4" aria-hidden="true" />
            Approuver
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={isPending}
            onClick={() => setRejectOpen(true)}
          >
            <X className="size-4" aria-hidden="true" />
            Refuser
          </Button>
          <p className="self-center text-xs text-neutral-500">
            Vérifiez que le nom des pièces correspond au nom déclaré.
          </p>
        </div>
      ) : (
        <div className="mt-3 border-t border-neutral-100 pt-3">
          <Badge tone={request.status === 'approved' ? 'success' : 'neutral'}>
            {request.status === 'approved' ? 'Approuvée' : 'Refusée'}
          </Badge>
          {request.rejection_reason ? (
            <p className="mt-1.5 text-sm text-neutral-600">{request.rejection_reason}</p>
          ) : null}
        </div>
      )}

      {error ? (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Refuser cette demande"
        description="Le motif sera transmis au vendeur : soyez précis pour qu’il puisse corriger."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setRejectOpen(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isPending}
              onClick={() => {
                if (!reason.trim()) return;
                setRejectOpen(false);
                review(false, reason.trim());
                setReason('');
              }}
            >
              Confirmer le refus
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-800">Motif du refus (obligatoire)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            required
            placeholder="Ex. la photo de la pièce d’identité est illisible."
            className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          />
        </label>
      </Modal>
    </article>
  );
}
