'use client';

/** Ligne de la file de modération : traitement d'un signalement. */
import { Archive, Check, ExternalLink, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { moderateAdAction, resolveReportAction } from '@/app/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { ReportReason } from '@/types';
import { formatRelativeDate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

const REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam ou publicité',
  fraud: 'Arnaque ou fraude',
  prohibited: 'Article interdit',
  duplicate: 'Annonce en double',
  wrong_category: 'Mauvaise catégorie',
  offensive: 'Contenu offensant',
  harassment: 'Harcèlement',
  fake_profile: 'Faux profil',
  other: 'Autre motif',
};

/** Un motif grave mérite d'être repéré au premier coup d'œil. */
const REASON_TONES: Partial<Record<ReportReason, BadgeTone>> = {
  fraud: 'danger',
  prohibited: 'danger',
  harassment: 'danger',
  fake_profile: 'warning',
};

export interface ReportRowProps {
  report: {
    id: string;
    target_type: string;
    reason: ReportReason;
    details: string | null;
    status: string;
    created_at: string;
    reporter: { id: string; full_name: string } | null;
    ad: { id: string; title: string; slug: string; reference: string; status: string } | null;
    target_user: { id: string; full_name: string } | null;
  };
}

export function ReportRow({ report }: ReportRowProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error ?? 'Action impossible.');
    });
  }

  const isOpen = report.status === 'open' || report.status === 'reviewing';

  return (
    <article className="rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={REASON_TONES[report.reason] ?? 'neutral'}>
              {REASON_LABELS[report.reason]}
            </Badge>
            <Badge tone="neutral">{report.target_type}</Badge>
            {report.status === 'reviewing' ? <Badge tone="warning">En cours</Badge> : null}
          </div>

          {report.ad ? (
            <Link
              href={buildListingHref(report.ad.slug, report.ad.reference)}
              target="_blank"
              className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand-900 hover:text-brand-800"
            >
              {report.ad.title}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </Link>
          ) : null}

          {report.target_user ? (
            <p className="mt-2 font-semibold text-brand-900">
              Compte signalé : {report.target_user.full_name}
            </p>
          ) : null}

          {report.details ? (
            <p className="mt-1.5 text-sm whitespace-pre-line text-neutral-700">{report.details}</p>
          ) : null}

          <p className="mt-2 text-xs text-neutral-500">
            Signalé par {report.reporter?.full_name ?? 'un utilisateur'} ·{' '}
            {formatRelativeDate(report.created_at)}
          </p>
        </div>

        {isPending ? (
          <Loader2 className="size-4 animate-spin text-neutral-500" aria-hidden="true" />
        ) : null}
      </div>

      {isOpen ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-neutral-100 pt-3">
          {report.ad ? (
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={isPending}
              onClick={() =>
                run(async () => {
                  const moderated = await moderateAdAction(
                    report.ad!.id,
                    'reject',
                    REASON_LABELS[report.reason],
                  );
                  if (!moderated.success) return moderated;
                  return resolveReportAction(report.id, 'resolved', 'Annonce retirée.');
                })
              }
            >
              <Archive className="size-4" aria-hidden="true" />
              Retirer l’annonce
            </Button>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => run(() => resolveReportAction(report.id, 'resolved'))}
          >
            <Check className="size-4" aria-hidden="true" />
            Marquer traité
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => run(() => resolveReportAction(report.id, 'dismissed'))}
          >
            <X className="size-4" aria-hidden="true" />
            Rejeter le signalement
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </article>
  );
}
