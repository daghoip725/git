'use client';

/**
 * Ligne utilisateur de l'espace d'administration : changement de rôle,
 * suspension, retrait du badge vérifié.
 *
 * Les boutons sont masqués quand l'action n'est pas permise, mais c'est la base
 * qui tranche : `admin_set_user_role` exige `is_admin()`, `admin_set_user_status`
 * exige `is_staff()` et refuse qu'un modérateur sanctionne un autre membre de
 * l'équipe. Une action déclenchée malgré tout revient en erreur explicite.
 */
import { Loader2, ShieldOff, ShieldCheck as ShieldCheckIcon } from 'lucide-react';
import { useState, useTransition } from 'react';

import {
  revokeVerificationAction,
  setUserRoleAction,
  setUserStatusAction,
} from '@/app/actions/admin.actions';
import { Avatar } from '@/components/common/Avatar';
import { VerifiedBadge } from '@/components/common/VerifiedBadge';
import { Alert } from '@/components/ui/Alert';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ROLE_LABELS } from '@/lib/auth/roles.client';
import type { AccountStatus, UserRole } from '@/types';
import { formatLongDate } from '@/utils/format';

const STATUS_LABELS: Record<AccountStatus, string> = {
  active: 'Actif',
  suspended: 'Suspendu',
  banned: 'Banni',
  deleted: 'Supprimé',
};

const STATUS_TONES: Record<AccountStatus, BadgeTone> = {
  active: 'success',
  suspended: 'warning',
  banned: 'danger',
  deleted: 'neutral',
};

const ROLE_TONES: Record<UserRole, BadgeTone> = {
  user: 'neutral',
  moderator: 'brand',
  admin: 'gold',
};

export interface UserRowProps {
  user: {
    id: string;
    full_name: string;
    city: string | null;
    role: UserRole;
    status: AccountStatus;
    is_verified: boolean;
    is_professional: boolean;
    business_name: string | null;
    email_verified: boolean;
    phone_verified: boolean;
    auth_provider: string | null;
    ads_count: number;
    created_at: string;
    avatarUrl: string | null;
  };
  /** Rôle de l'administrateur connecté : conditionne les actions proposées. */
  viewerRole: UserRole;
  /** Identifiant de l'administrateur connecté : on ne s'auto-modifie pas. */
  viewerId: string;
}

export function UserRow({ user, viewerRole, viewerId }: UserRowProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<'suspended' | 'banned' | null>(null);
  const [reason, setReason] = useState('');

  const isSelf = user.id === viewerId;
  const canChangeRole = viewerRole === 'admin' && !isSelf;
  const isTargetStaff = user.role !== 'user';
  const canModerate = !isSelf && (viewerRole === 'admin' || !isTargetStaff);

  function run(action: () => Promise<{ success: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.success) setError(result.error ?? 'Action impossible.');
    });
  }

  return (
    <article className="rounded-xl border border-neutral-200 bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Avatar name={user.full_name} src={user.avatarUrl} size={44} />

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-brand-900">
            <span className="truncate">{user.full_name}</span>
            {user.is_verified ? <VerifiedBadge size="sm" /> : null}
            {isSelf ? <span className="text-xs font-normal text-neutral-500">(vous)</span> : null}
          </p>

          <p className="mt-0.5 text-xs text-neutral-500">
            {user.city ?? 'Ville non renseignée'} · Inscrit le {formatLongDate(user.created_at)} ·{' '}
            {user.ads_count} annonce{user.ads_count > 1 ? 's' : ''}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={ROLE_TONES[user.role]}>{ROLE_LABELS[user.role]}</Badge>
            <Badge tone={STATUS_TONES[user.status]}>{STATUS_LABELS[user.status]}</Badge>
            {user.auth_provider ? <Badge tone="neutral">{user.auth_provider}</Badge> : null}
            {user.email_verified ? <Badge tone="success">E-mail vérifié</Badge> : null}
            {user.phone_verified ? <Badge tone="success">Téléphone vérifié</Badge> : null}
            {user.business_name ? <Badge tone="gold">{user.business_name}</Badge> : null}
          </div>
        </div>

        {isPending ? (
          <Loader2
            className="size-4 animate-spin self-center text-neutral-500"
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* ------------------------------- Actions ------------------------------- */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3">
        {canChangeRole ? (
          <label className="flex items-center gap-2 text-xs text-neutral-600">
            Rôle
            <select
              value={user.role}
              disabled={isPending}
              onChange={(event) =>
                run(() => setUserRoleAction(user.id, event.target.value as UserRole))
              }
              className="h-9 rounded-lg border border-neutral-300 bg-card px-2 text-xs font-semibold text-neutral-800 focus:outline-none"
              aria-label={`Rôle de ${user.full_name}`}
            >
              <option value="user">Utilisateur</option>
              <option value="moderator">Modérateur</option>
              <option value="admin">Administrateur</option>
            </select>
          </label>
        ) : null}

        {canModerate && user.status === 'active' ? (
          <>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStatusModal('suspended')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-50 disabled:opacity-50"
            >
              <ShieldOff className="size-3.5" aria-hidden="true" />
              Suspendre
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setStatusModal('banned')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Bannir
            </button>
          </>
        ) : null}

        {canModerate && user.status !== 'active' ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => setUserStatusAction(user.id, 'active'))}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-brand-300 px-3 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-50 disabled:opacity-50"
          >
            <ShieldCheckIcon className="size-3.5" aria-hidden="true" />
            Réactiver
          </button>
        ) : null}

        {user.is_verified && !isSelf ? (
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => revokeVerificationAction(user.id))}
            className="inline-flex h-9 items-center rounded-lg border border-neutral-300 px-3 text-xs font-semibold text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50"
          >
            Retirer le badge
          </button>
        ) : null}

        {isSelf ? (
          <p className="text-xs text-neutral-500">
            Vous ne pouvez pas modifier votre propre rôle ni votre propre statut.
          </p>
        ) : null}
      </div>

      {error ? (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      ) : null}

      <Modal
        open={statusModal !== null}
        onClose={() => setStatusModal(null)}
        title={statusModal === 'banned' ? 'Bannir ce compte ?' : 'Suspendre ce compte ?'}
        description="Les annonces en ligne de ce compte seront retirées de la vitrine."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setStatusModal(null)}>
              Annuler
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isPending}
              onClick={() => {
                const target = statusModal;
                setStatusModal(null);
                if (target) run(() => setUserStatusAction(user.id, target, reason || undefined));
                setReason('');
              }}
            >
              Confirmer
            </Button>
          </>
        }
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-neutral-800">Motif (consigné dans le journal)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex. annonces frauduleuses répétées"
            className="rounded-lg border border-neutral-300 px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          />
        </label>
      </Modal>
    </article>
  );
}
