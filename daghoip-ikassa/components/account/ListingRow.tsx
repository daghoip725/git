'use client';

/**
 * Ligne d'annonce du tableau de bord vendeur, avec ses actions
 * (modifier, marquer vendue, remettre en ligne, supprimer).
 */
import { Eye, ImageOff, Loader2, Megaphone, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { deleteAdAction, setAdStatusAction } from '@/app/actions/ads.actions';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { AdStatus } from '@/types';
import { AD_STATUS_LABELS } from '@/utils/constants';
import { formatListingPrice, formatRelativeDate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

const STATUS_TONES: Record<AdStatus, BadgeTone> = {
  draft: 'neutral',
  pending_review: 'warning',
  published: 'success',
  sold: 'brand',
  expired: 'neutral',
  rejected: 'danger',
  archived: 'neutral',
};

export interface ListingRowProps {
  listing: {
    id: string;
    title: string;
    slug: string;
    reference: string;
    price: number | null;
    price_type: 'fixed' | 'negotiable' | 'free' | 'on_request';
    status: AdStatus;
    views_count: number;
    coverImageUrl: string | null;
    created_at: string;
  };
}

export function ListingRow({ listing }: ListingRowProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function runAction(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error ?? 'Action impossible.');
      else router.refresh();
    });
  }

  const href = buildListingHref(listing.slug, listing.reference);

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-3 sm:p-4">
      <div className="flex gap-3 sm:gap-4">
        <Link
          href={href}
          className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 sm:size-24"
        >
          {listing.coverImageUrl ? (
            <Image src={listing.coverImageUrl} alt="" fill sizes="96px" className="object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-neutral-300">
              <ImageOff className="size-7" aria-hidden="true" />
            </span>
          )}
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link href={href} className="min-w-0">
              <h3 className="line-clamp-2-safe text-sm font-semibold text-brand-900 hover:text-brand-700 sm:text-base">
                {listing.title}
              </h3>
            </Link>
            <Badge tone={STATUS_TONES[listing.status]}>{AD_STATUS_LABELS[listing.status]}</Badge>
          </div>

          <p className="mt-1 font-bold text-brand-700">
            {formatListingPrice(listing.price, listing.price_type)}
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Eye className="size-3.5" aria-hidden="true" />
              {listing.views_count} vue{listing.views_count > 1 ? 's' : ''}
            </span>
            <span>Réf. {listing.reference}</span>
            <span>{formatRelativeDate(listing.created_at)}</span>
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/compte/annonces/${listing.id}/modifier`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Modifier
            </Link>

            {listing.status === 'published' ? (
              <Link
                href={`/compte/annonces/${listing.id}/mise-en-avant`}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gold-400 px-3 text-xs font-semibold text-gold-700 transition-colors hover:bg-gold-50"
              >
                <Megaphone className="size-3.5" aria-hidden="true" />
                Mettre en avant
              </Link>
            ) : null}

            {listing.status === 'published' ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => setAdStatusAction(listing.id, 'sold'))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 px-3 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50"
              >
                Marquer comme vendu
              </button>
            ) : null}

            {listing.status === 'expired' ||
            listing.status === 'sold' ||
            listing.status === 'draft' ||
            listing.status === 'archived' ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => runAction(() => setAdStatusAction(listing.id, 'published'))}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 px-3 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Remettre en ligne
              </button>
            ) : null}

            <button
              type="button"
              disabled={isPending}
              onClick={() => setConfirmOpen(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Supprimer
            </button>

            {isPending ? (
              <Loader2
                className="size-4 animate-spin self-center text-neutral-400"
                aria-hidden="true"
              />
            ) : null}
          </div>

          {error ? (
            <Alert tone="error" className="mt-3">
              {error}
            </Alert>
          ) : null}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Supprimer cette annonce ?"
        description="Cette action est définitive : l’annonce et ses photos seront supprimées."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isPending}
              onClick={() => {
                setConfirmOpen(false);
                runAction(() => deleteAdAction(listing.id));
              }}
            >
              Supprimer définitivement
            </Button>
          </>
        }
      >
        <p className="text-sm text-neutral-700">
          « {listing.title} » sera retirée du site immédiatement.
        </p>
      </Modal>
    </article>
  );
}
