import { ScrollText } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { requireRole } from '@/lib/auth/roles';
import { getAuditLog } from '@/services/admin.service';
import type { AuditAction } from '@/types';
import { formatDateTime } from '@/utils/format';

const ACTION_LABELS: Record<AuditAction, string> = {
  role_changed: 'Changement de rôle',
  status_changed: 'Changement de statut',
  verification_requested: 'Demande de vérification',
  verification_approved: 'Vérification approuvée',
  verification_rejected: 'Vérification refusée',
  ad_moderated: 'Annonce modérée',
  report_resolved: 'Signalement traité',
};

const ACTION_TONES: Record<AuditAction, BadgeTone> = {
  role_changed: 'gold',
  status_changed: 'warning',
  verification_requested: 'neutral',
  verification_approved: 'success',
  verification_rejected: 'danger',
  ad_moderated: 'warning',
  report_resolved: 'brand',
};

export default async function AdminAuditPage() {
  await requireRole('moderator', '/admin/journal');
  const entries = await getAuditLog(100);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-brand-900">Journal d’audit</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Trace immuable des actions sensibles. Aucune écriture n’est possible depuis l’application
          : seules les fonctions PostgreSQL habilitées y ajoutent des lignes.
        </p>
      </header>

      {entries.length > 0 ? (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-neutral-200 bg-white p-3.5"
            >
              <div className="min-w-0">
                <Badge tone={ACTION_TONES[entry.action]}>{ACTION_LABELS[entry.action]}</Badge>
                <p className="mt-1.5 text-sm text-neutral-800">
                  <strong>{entry.actor?.full_name ?? 'Système'}</strong>
                  {entry.target ? (
                    <>
                      {' → '}
                      <strong>{entry.target.full_name}</strong>
                    </>
                  ) : null}
                </p>
                {entry.details && Object.keys(entry.details).length > 0 ? (
                  <pre className="mt-1 overflow-x-auto rounded bg-neutral-50 p-2 text-[11px] text-neutral-600">
                    {JSON.stringify(entry.details, null, 2)}
                  </pre>
                ) : null}
              </div>

              <time dateTime={entry.created_at} className="shrink-0 text-xs text-neutral-400">
                {formatDateTime(entry.created_at)}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ScrollText}
          title="Journal vide"
          description="Les actions de modération apparaîtront ici."
        />
      )}
    </div>
  );
}
