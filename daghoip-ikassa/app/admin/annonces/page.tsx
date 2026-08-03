import { FileText } from 'lucide-react';
import Link from 'next/link';

import { AdminAdRow } from '@/components/admin/AdminAdRow';
import { EmptyState } from '@/components/common/EmptyState';
import { requireRole } from '@/lib/auth/roles';
import { getAdminAds } from '@/services/admin.service';
import type { AdStatus } from '@/types';
import { AD_STATUS_LABELS } from '@/utils/constants';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const STATUSES = Object.keys(AD_STATUS_LABELS) as AdStatus[];

function single(value: string | string[] | undefined): string | undefined {
  const result = Array.isArray(value) ? value[0] : value;
  return result && result.trim() !== '' ? result : undefined;
}

export default async function AdminAdsPage({ searchParams }: PageProps) {
  await requireRole('moderator');

  const params = await searchParams;
  const statusParam = single(params.statut);
  const status = STATUSES.includes(statusParam as AdStatus) ? (statusParam as AdStatus) : undefined;
  const query = single(params.q);

  const ads = await getAdminAds({ status, query, limit: 100 });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-brand-900">Annonces</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Tous statuts confondus. Archiver retire l’annonce de la recherche ; refuser exige un
          motif, transmis au vendeur par notification.
        </p>
      </div>

      {/* -------------------------- Filtres -------------------------- */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1">
          <span className="mb-1 block text-sm font-medium text-neutral-800">Rechercher</span>
          <input
            type="search"
            name="q"
            defaultValue={query ?? ''}
            placeholder="Titre ou référence…"
            className="h-11 w-full rounded-lg border border-neutral-300 px-3.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
          />
        </label>

        <label>
          <span className="mb-1 block text-sm font-medium text-neutral-800">Statut</span>
          <select
            name="statut"
            defaultValue={status ?? ''}
            className="h-11 rounded-lg border border-neutral-300 bg-card px-3 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="">Tous</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {AD_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="h-11 rounded-lg bg-brand-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-ink"
        >
          Filtrer
        </button>

        {status || query ? (
          <Link
            href="/admin/annonces"
            className="h-11 rounded-lg px-3 text-sm leading-[2.75rem] font-semibold text-neutral-600 hover:text-brand-800"
          >
            Réinitialiser
          </Link>
        ) : null}
      </form>

      <p className="text-sm text-neutral-600" role="status">
        {ads.length} annonce{ads.length > 1 ? 's' : ''}
        {ads.length === 100 ? ' (100 premières)' : ''}
      </p>

      {ads.length > 0 ? (
        <ul className="space-y-2">
          {ads.map((ad) => (
            <li key={ad.id}>
              <AdminAdRow ad={ad} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={FileText}
          title="Aucune annonce ne correspond"
          description="Élargissez la recherche ou changez de statut."
        />
      )}
    </div>
  );
}
