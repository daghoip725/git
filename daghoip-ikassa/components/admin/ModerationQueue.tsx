'use client';

/**
 * File de triage, groupée par cible.
 *
 * Ce que cette vue apporte par rapport à la liste à plat : **le nombre de
 * signaleurs distincts**. Huit personnes sans lien entre elles qui désignent le
 * même compte, c'est un dossier ; huit signalements d'une même personne, c'est
 * de l'acharnement. La liste chronologique confondait les deux.
 *
 * Toutes les actions passent par des RPC qui revérifient `is_staff()` : ce que
 * l'écran propose n'accorde aucun pouvoir, il rend accessible celui que la base
 * reconnaît déjà.
 */
import { AlertTriangle, Ban, Check, PauseCircle, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { blockAccountAction, resolveTargetReportsAction } from '@/app/actions/admin.actions';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { AccountStatus } from '@/types';
import { REPORT_REASON_LABELS } from '@/utils/constants';
import { formatRelativeDate } from '@/utils/format';

export interface QueueItem {
  targetType: 'ad' | 'user' | 'message' | 'review';
  targetId: string;
  label: string;
  href: string;
  targetStatus: AccountStatus;
  reportCount: number;
  reporterCount: number;
  reasons: string[];
  firstReported: string;
}

const STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  banned: 'Banni',
  deleted: 'Supprimé',
};

const STATUS_TONES: Record<AccountStatus, BadgeTone> = {
  active: 'neutral',
  suspended: 'warning',
  banned: 'danger',
  deleted: 'neutral',
};

/**
 * Trois paliers de lecture, pas une échelle continue.
 *
 * Le seuil porte sur les **signaleurs distincts**, jamais sur le total : c'est
 * la seule mesure qui résiste à quelqu'un qui signalerait en boucle.
 */
function urgencyTone(reporterCount: number): BadgeTone {
  if (reporterCount >= 5) return 'danger';
  if (reporterCount >= 2) return 'warning';
  return 'neutral';
}

export function ModerationQueue({ items }: { items: QueueItem[] }) {
  const [queue, setQueue] = useState(items);
  const [error, setError] = useState<string | null>(null);

  function drop(targetId: string) {
    setQueue((previous) => previous.filter((item) => item.targetId !== targetId));
  }

  if (queue.length === 0) {
    return (
      <EmptyState
        icon={Check}
        title="Aucun dossier en attente"
        description="Tous les signalements ont été traités. La file se remplira d’elle-même."
      />
    );
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <ul className="space-y-3">
        {queue.map((item) => (
          <QueueRow
            key={`${item.targetType}:${item.targetId}`}
            item={item}
            onDone={drop}
            onError={setError}
          />
        ))}
      </ul>
    </div>
  );
}

function QueueRow({
  item,
  onDone,
  onError,
}: {
  item: QueueItem;
  onDone: (targetId: string) => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [blockOpen, setBlockOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [pendingStatus, setPendingStatus] = useState<'suspended' | 'banned'>('suspended');

  function dismiss() {
    startTransition(async () => {
      const result = await resolveTargetReportsAction(
        item.targetType === 'user' ? 'user' : 'ad',
        item.targetId,
        'dismissed',
        'Signalement examiné, aucune infraction constatée.',
      );
      if (result.success) {
        onDone(item.targetId);
        router.refresh();
      } else {
        onError(result.error);
      }
    });
  }

  function block() {
    startTransition(async () => {
      const result = await blockAccountAction(item.targetId, pendingStatus, reason || undefined);
      if (result.success) {
        setBlockOpen(false);
        onDone(item.targetId);
        router.refresh();
      } else {
        onError(result.error);
      }
    });
  }

  const isUser = item.targetType === 'user';

  return (
    <li className="rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={isUser ? 'brand' : 'neutral'}>{isUser ? 'Compte' : 'Annonce'}</Badge>
            {isUser && item.targetStatus !== 'active' ? (
              <Badge tone={STATUS_TONES[item.targetStatus]}>
                {STATUS_LABELS[item.targetStatus]}
              </Badge>
            ) : null}
          </div>

          <Link
            href={item.href}
            className="mt-1.5 block font-semibold text-brand-900 hover:underline"
          >
            {item.label}
          </Link>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            <span className="flex items-center gap-1">
              <Users className="size-3.5" aria-hidden="true" />
              {item.reporterCount} signaleur{item.reporterCount > 1 ? 's' : ''} distinct
              {item.reporterCount > 1 ? 's' : ''}
            </span>
            <span>
              {item.reportCount} signalement{item.reportCount > 1 ? 's' : ''}
            </span>
            <span>Premier {formatRelativeDate(item.firstReported)}</span>
          </p>

          <p className="mt-2 flex flex-wrap gap-1.5">
            {item.reasons.map((reasonCode) => (
              <span
                key={reasonCode}
                className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-700"
              >
                {REPORT_REASON_LABELS[reasonCode as keyof typeof REPORT_REASON_LABELS] ??
                  reasonCode}
              </span>
            ))}
          </p>
        </div>

        <Badge tone={urgencyTone(item.reporterCount)}>
          {item.reporterCount >= 5 ? (
            <>
              <AlertTriangle className="size-3" aria-hidden="true" />À examiner en priorité
            </>
          ) : item.reporterCount >= 2 ? (
            'Plusieurs signaleurs'
          ) : (
            'Signalement isolé'
          )}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} disabled={isPending}>
          <Check className="size-4" aria-hidden="true" />
          Rien à signaler
        </Button>

        {isUser && item.targetStatus === 'active' ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPendingStatus('suspended');
                setBlockOpen(true);
              }}
              disabled={isPending}
            >
              <PauseCircle className="size-4" aria-hidden="true" />
              Suspendre
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => {
                setPendingStatus('banned');
                setBlockOpen(true);
              }}
              disabled={isPending}
            >
              <Ban className="size-4" aria-hidden="true" />
              Bannir
            </Button>
          </>
        ) : null}

        {!isUser ? (
          <Link
            href="/admin/annonces"
            className="inline-flex h-9 items-center rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50"
          >
            Traiter l’annonce
          </Link>
        ) : null}
      </div>

      <Modal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        title={pendingStatus === 'banned' ? `Bannir ${item.label}` : `Suspendre ${item.label}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            Les annonces publiées de ce compte seront retirées de la vitrine et les{' '}
            {item.reportCount} signalement{item.reportCount > 1 ? 's' : ''} le visant seront clos.
            L’action est inscrite au journal d’audit.
          </p>

          <Input
            label="Motif"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Ex. : sollicitations frauduleuses répétées en messagerie"
            hint="Conservé au journal d’audit et joint à la clôture des signalements."
          />

          {/* Dit franchement : la sanction ne prévient pas l'intéressé dans
              l'application, puisqu'un compte inactif ne reçoit plus de
              notification. */}
          <Alert tone="warning">
            Un compte suspendu ou banni ne reçoit plus de notification dans l’application. Si vous
            souhaitez prévenir la personne, faites-le par un autre moyen.
          </Alert>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setBlockOpen(false)}>
              Annuler
            </Button>
            <Button type="button" variant="danger" onClick={block} isLoading={isPending}>
              {pendingStatus === 'banned' ? 'Bannir le compte' : 'Suspendre le compte'}
            </Button>
          </div>
        </div>
      </Modal>
    </li>
  );
}
