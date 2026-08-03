import { Flag } from 'lucide-react';
import Link from 'next/link';

import { ReportRow } from '@/components/admin/ReportRow';
import { EmptyState } from '@/components/common/EmptyState';
import { requireRole } from '@/lib/auth/roles';
import { getReports } from '@/services/admin.service';
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

  const reports = await getReports(status);

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-brand-900">Signalements</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Traitez les contenus signalés par la communauté.
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
    </div>
  );
}
