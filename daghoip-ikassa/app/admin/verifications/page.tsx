import { BadgeCheck } from 'lucide-react';
import Link from 'next/link';

import { VerificationCard } from '@/components/admin/VerificationCard';
import { EmptyState } from '@/components/common/EmptyState';
import { requireRole } from '@/lib/auth/roles';
import { getDocumentSignedUrl, getVerificationQueue } from '@/services/verification.service';
import { cn } from '@/utils/cn';

interface PageProps {
  searchParams: Promise<{ statut?: string | string[] }>;
}

const TABS = [
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Approuvées' },
  { value: 'rejected', label: 'Refusées' },
] as const;

type QueueStatus = (typeof TABS)[number]['value'];

export default async function AdminVerificationsPage({ searchParams }: PageProps) {
  await requireRole('moderator', '/admin/verifications');

  const params = await searchParams;
  const raw = Array.isArray(params.statut) ? params.statut[0] : params.statut;
  const status: QueueStatus = TABS.some((tab) => tab.value === raw)
    ? (raw as QueueStatus)
    : 'pending';

  const requests = await getVerificationQueue(status);

  // Les pièces vivent dans un bucket privé : on signe les URL à la volée,
  // pour 5 minutes, au moment du rendu de la page.
  const withDocuments = await Promise.all(
    requests.map(async (request) => ({
      request,
      documentUrls: [
        {
          label: 'Pièce d’identité',
          url: await getDocumentSignedUrl(request.id_document_path),
        },
        ...(request.business_document_path
          ? [
              {
                label: 'Document d’entreprise',
                url: await getDocumentSignedUrl(request.business_document_path),
              },
            ]
          : []),
      ],
    })),
  );

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-brand-900">Demandes de vérification</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Approuver pose le badge « vendeur vérifié » sur le compte et sur toutes ses annonces.
        </p>
      </header>

      <nav aria-label="Filtrer par statut" className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/verifications?statut=${tab.value}`}
            aria-current={status === tab.value ? 'page' : undefined}
            className={cn(
              'flex-1 rounded-md px-3 py-2 text-center text-sm font-semibold transition-colors',
              status === tab.value
                ? 'bg-white text-brand-800 shadow-sm'
                : 'text-neutral-600 hover:text-neutral-800',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {withDocuments.length > 0 ? (
        <ul className="space-y-3">
          {withDocuments.map(({ request, documentUrls }) => (
            <li key={request.id}>
              <VerificationCard request={request} documentUrls={documentUrls} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={BadgeCheck}
          title={status === 'pending' ? 'Aucune demande en attente' : 'Aucune demande'}
          description={
            status === 'pending'
              ? 'Les nouvelles demandes de vérification apparaîtront ici.'
              : 'Changez de filtre pour voir d’autres demandes.'
          }
        />
      )}
    </div>
  );
}
