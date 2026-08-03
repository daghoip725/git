'use client';

/**
 * Historiques personnels : recherches et annonces consultées.
 *
 * Chaque entrée est supprimable à l'unité, et chaque liste effaçable d'un
 * geste. La confirmation ne porte que sur le « tout effacer » : supprimer une
 * ligne est sans conséquence, en demander confirmation transformerait un geste
 * anodin en obstacle.
 */
import { Clock, Eye, Search, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import {
  clearHistoryAction,
  deleteAdViewAction,
  deleteSearchAction,
} from '@/app/actions/history.actions';
import { EmptyState } from '@/components/common/EmptyState';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatPrice, formatRelativeDate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

export interface RecentSearch {
  id: string;
  query: string;
  filters: Record<string, string>;
  resultsCount: number | null;
  createdAt: string;
}

export interface RecentView {
  id: string;
  title: string;
  slug: string;
  reference: string;
  price: number | null;
  city: string;
  viewedAt: string;
  viewCount: number;
}

/** Reconstruit l'URL de recherche à partir du texte et des filtres mémorisés. */
function searchHref(entry: RecentSearch): string {
  const params = new URLSearchParams({ q: entry.query });
  for (const [key, value] of Object.entries(entry.filters ?? {})) {
    if (value) params.set(key, value);
  }
  return `/annonces?${params.toString()}`;
}

export function HistoryPanels({
  searches,
  views,
}: {
  searches: RecentSearch[];
  views: RecentView[];
}) {
  return (
    <div className="space-y-8">
      <SearchPanel searches={searches} />
      <ViewsPanel views={views} />

      <p className="text-xs text-neutral-500">
        Ces historiques ne sont visibles que par vous — pas même par l’équipe de Daghoip Ikassa. Ils
        sont automatiquement effacés au bout de 90 jours.
      </p>
    </div>
  );
}

function SearchPanel({ searches }: { searches: RecentSearch[] }) {
  const router = useRouter();
  const [items, setItems] = useState(searches);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function removeOne(id: string) {
    setItems((previous) => previous.filter((item) => item.id !== id));
    startTransition(async () => {
      const result = await deleteSearchAction(id);
      if (!result.success) {
        setError(result.error);
        router.refresh();
      }
    });
  }

  function clearAll() {
    startTransition(async () => {
      const result = await clearHistoryAction('searches');
      if (result.success) {
        setItems([]);
        setConfirmOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section aria-labelledby="recherches-titre" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="recherches-titre" className="text-sm font-semibold text-neutral-800">
          Mes recherches récentes ({items.length})
        </h2>
        {items.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Tout effacer
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-card">
          {items.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 p-3">
              <Search className="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
              <Link href={searchHref(entry)} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {entry.query}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {entry.resultsCount !== null
                    ? `${entry.resultsCount} résultat${entry.resultsCount > 1 ? 's' : ''} · `
                    : ''}
                  {formatRelativeDate(entry.createdAt)}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => removeOne(entry.id)}
                disabled={isPending}
                aria-label={`Retirer « ${entry.query} » de l’historique`}
                className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Search}
          title="Aucune recherche enregistrée"
          description="Vos recherches apparaîtront ici pour que vous puissiez les relancer d’un clic."
          action={<ButtonLink href="/annonces">Rechercher une annonce</ButtonLink>}
        />
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Effacer l’historique de recherche"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            Vos {items.length} recherches enregistrées seront supprimées définitivement.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button type="button" variant="danger" onClick={clearAll} isLoading={isPending}>
              Tout effacer
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function ViewsPanel({ views }: { views: RecentView[] }) {
  const router = useRouter();
  const [items, setItems] = useState(views);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function removeOne(adId: string) {
    setItems((previous) => previous.filter((item) => item.id !== adId));
    startTransition(async () => {
      const result = await deleteAdViewAction(adId);
      if (!result.success) {
        setError(result.error);
        router.refresh();
      }
    });
  }

  function clearAll() {
    startTransition(async () => {
      const result = await clearHistoryAction('views');
      if (result.success) {
        setItems([]);
        setConfirmOpen(false);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <section aria-labelledby="consultees-titre" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="consultees-titre" className="text-sm font-semibold text-neutral-800">
          Annonces consultées ({items.length})
        </h2>
        {items.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Tout effacer
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-card">
          {items.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 p-3">
              <Clock className="size-4 shrink-0 text-neutral-500" aria-hidden="true" />
              <Link href={buildListingHref(entry.slug, entry.reference)} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-neutral-900">
                  {entry.title}
                </span>
                <span className="mt-0.5 block text-xs text-neutral-500">
                  {formatPrice(entry.price) ?? 'Prix sur demande'} · {entry.city} ·{' '}
                  {formatRelativeDate(entry.viewedAt)}
                  {entry.viewCount > 1 ? (
                    <span className="ml-1 inline-flex items-center gap-1">
                      <Eye className="size-3" aria-hidden="true" />
                      {entry.viewCount} fois
                    </span>
                  ) : null}
                </span>
              </Link>
              <button
                type="button"
                onClick={() => removeOne(entry.id)}
                disabled={isPending}
                aria-label={`Retirer « ${entry.title} » de l’historique`}
                className="shrink-0 rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={Clock}
          title="Aucune annonce consultée"
          description="Les annonces que vous ouvrez apparaîtront ici, pour les retrouver facilement."
          action={<ButtonLink href="/annonces">Parcourir les annonces</ButtonLink>}
        />
      )}

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Effacer les annonces consultées"
      >
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            Vos {items.length} consultations enregistrées seront supprimées définitivement. Cela ne
            retire rien de vos favoris.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button type="button" variant="danger" onClick={clearAll} isLoading={isPending}>
              Tout effacer
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
