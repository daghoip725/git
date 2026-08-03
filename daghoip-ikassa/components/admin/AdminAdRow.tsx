'use client';

/**
 * Ligne d'annonce dans l'espace de modération.
 *
 * Les trois actions passent par la RPC `admin_moderate_ad()` et non par un
 * UPDATE direct : `rejection_reason` est hors du `GRANT UPDATE` accordé aux
 * comptes ordinaires, pour qu'un vendeur ne rédige jamais lui-même le motif de
 * refus de sa propre annonce. La RPC revérifie `is_staff()` et journalise.
 */
import { Archive, Ban, Eye, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { moderateAdAction } from '@/app/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { AdminAdRow as AdminAd } from '@/services/admin.service';
import { AD_STATUS_LABELS } from '@/utils/constants';
import { formatListingPrice, formatRelativeDate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

const TONES: Record<string, 'brand' | 'gold' | 'neutral' | 'danger'> = {
  published: 'brand',
  pending_review: 'gold',
  rejected: 'danger',
  sold: 'neutral',
  expired: 'neutral',
  archived: 'neutral',
  draft: 'neutral',
};

export function AdminAdRow({ ad }: { ad: AdminAd }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
  const [reason, setReason] = useState('');

  function run(action: 'archive' | 'reject' | 'restore', motive?: string) {
    setError(null);
    startTransition(async () => {
      const result = await moderateAdAction(ad.id, action, motive);
      if (result.success) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <article className="rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-brand-900">{ad.title}</h3>
            <Badge tone={TONES[ad.status] ?? 'neutral'}>{AD_STATUS_LABELS[ad.status]}</Badge>
          </div>

          <p className="mt-1 text-sm text-neutral-600">
            {ad.seller?.full_name ?? 'Vendeur supprimé'} · {ad.city} ·{' '}
            {formatListingPrice(ad.price, 'fixed')} · {ad.views_count} vue
            {ad.views_count > 1 ? 's' : ''}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Réf. {ad.reference} · {ad.category?.name ?? 'Sans catégorie'} ·{' '}
            {formatRelativeDate(ad.created_at)}
          </p>

          {ad.rejection_reason ? (
            <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-800">
              Motif enregistré : {ad.rejection_reason}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
        <Link
          href={buildListingHref(ad.slug, ad.reference)}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-brand-800"
        >
          <Eye className="size-4" aria-hidden="true" />
          Voir
        </Link>

        {ad.status === 'archived' || ad.status === 'rejected' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => run('restore')}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Republier
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => run('archive')}
            >
              <Archive className="size-4" aria-hidden="true" />
              Archiver
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() => setConfirmReject(true)}
            >
              <Ban className="size-4" aria-hidden="true" />
              Refuser
            </Button>
          </>
        )}
      </div>

      {error ? (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <Modal
        open={confirmReject}
        onClose={() => setConfirmReject(false)}
        title="Refuser cette annonce ?"
        description="Le vendeur reçoit une notification contenant le motif. Soyez précis : c’est ce texte qui lui permettra de corriger."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmReject(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={reason.trim().length === 0}
              isLoading={isPending}
              onClick={() => {
                setConfirmReject(false);
                run('reject', reason.trim());
              }}
            >
              Refuser
            </Button>
          </>
        }
      >
        <label htmlFor={`reject-${ad.id}`} className="text-sm font-medium text-neutral-800">
          Motif du refus
        </label>
        <textarea
          id={`reject-${ad.id}`}
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Ex. photos ne correspondant pas à l’article décrit."
          className="mt-1.5 w-full resize-y rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
        />
      </Modal>
    </article>
  );
}
