import { Flag } from 'lucide-react';
import Link from 'next/link';

import { ModerationQueue } from '@/components/admin/ModerationQueue';
import { ReportRow } from '@/components/admin/ReportRow';
import { EmptyState } from '@/components/common/EmptyState';
import { requireRole } from '@/lib/auth/roles';
import { getModerationQueue, getReports } from '@/services/admin.service';
import { cn } from '@/utils/cn';

interface PageProps {
  searchParams: Promise<{ statut?: string | string[] }>;
}

const TABS = [
  { value: 'open', label: 'Ouverts' },
  { value: 'reviewing', label: 'En cours' },
  { value: 'resolved', label: 'Traités' },
  { value: 'dismissed', label: 'Rejetés' },
] as const;

type ReportTab = (typeof TABS)[number]['value'];

export default async function AdminReportsPage({ searchParams }: PageProps) {
  await requireRole('moderator', '/admin/signalements');

  const params = await searchParams;
  const raw = Array.isArray(params.statut) ? params.statut[0] : params.statut;
  const status: ReportTab = TABS.some((tab) => tab.value === raw) ? (raw as ReportTab) : 'open';

  // La file de triage n'a de sens que sur les dossiers en cours : « traités »
  // et « rejetés » ne se trient plus, ils se relisent.
  const showQueue = status === 'open' || status === 'reviewing';
  const [reports, queue] = await Promise.all([
    getReports(status),
    showQueue ? getModerationQueue(50) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-brand-900">Signalements</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Traitez les contenus et les comptes signalés par la communauté. Aucun compte n’est bloqué
          automatiquement : un signalement ouvre un dossier, une personne tranche.
        </p>
      </header>

      <nav aria-label="Filtrer par statut" className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/signalements?statut=${tab.value}`}
            aria-current={status === tab.value ? 'page' : undefined}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-center text-sm font-semibold transition-colors',
              status === tab.value
                ? 'bg-card text-brand-800 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-800',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {showQueue ? (
        <section aria-labelledby="triage-titre" className="space-y-3">
          <div>
            <h3 id="triage-titre" className="text-sm font-semibold text-neutral-800">
              À traiter, par cible ({queue.length})
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              Classé par nombre de <strong>signaleurs distincts</strong> : c’est la seule mesure qui
              résiste à quelqu’un qui signalerait en boucle.
            </p>
          </div>
          <ModerationQueue items={queue} />
        </section>
      ) : null}

      <section aria-labelledby="detail-titre" className="space-y-3">
        <h3 id="detail-titre" className="text-sm font-semibold text-neutral-800">
          Signalements un par un ({reports.length})
        </h3>

        {reports.length > 0 ? (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id}>
                <ReportRow report={report} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Flag}
            title="Aucun signalement"
            description="Rien à traiter dans cette catégorie pour le moment."
          />
        )}
      </section>
    </div>
  );
}
