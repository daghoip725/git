import { BadgeCheck, Clock, ShieldCheck, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { VerificationForm } from '@/components/account/VerificationForm';
import { VerifiedBadge } from '@/components/common/VerifiedBadge';
import { Alert } from '@/components/ui/Alert';
import { getCurrentUser } from '@/lib/supabase/server';
import { getMyProfile } from '@/services/users.service';
import { getMyVerificationRequests } from '@/services/verification.service';
import { formatLongDate } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Vérification du compte',
  robots: { index: false, follow: false },
};

const BENEFITS = [
  'Un badge visible sur votre profil et sur chacune de vos annonces.',
  'Un meilleur taux de réponse : les acheteurs contactent d’abord les vendeurs vérifiés.',
  'Votre nom commercial affiché si vous êtes une entreprise.',
];

export default async function VerificationPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/verification');

  const [profile, requests] = await Promise.all([
    getMyProfile(),
    getMyVerificationRequests(user.id),
  ]);

  const pending = requests.find((request) => request.status === 'pending');
  const lastRejected = requests.find((request) => request.status === 'rejected');

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">Vérification du compte</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Le badge « vendeur vérifié » rassure les acheteurs sur votre identité.
        </p>
      </header>

      {/* ------------------------------ Déjà vérifié ---------------------------- */}
      {profile?.is_verified ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-6 text-center">
          <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-white">
            <ShieldCheck className="size-7 text-brand-600" aria-hidden="true" />
          </span>
          <h2 className="font-bold text-brand-900">Votre compte est vérifié</h2>
          <p className="mt-1 text-sm text-neutral-700">
            Le badge ci-dessous apparaît sur votre profil et vos annonces.
          </p>
          <div className="mt-4 flex justify-center">
            <VerifiedBadge variant="full" />
          </div>
        </div>
      ) : pending ? (
        /* ---------------------------- Demande en cours -------------------------- */
        <Alert tone="info" title="Demande en cours d’instruction">
          <p className="flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden="true" />
            Déposée le {formatLongDate(pending.created_at)}. Notre équipe l’examine sous 48 heures
            ouvrées.
          </p>
        </Alert>
      ) : (
        /* ------------------------------- Formulaire ----------------------------- */
        <>
          {lastRejected ? (
            <Alert tone="warning" title="Votre précédente demande a été refusée">
              <p className="flex items-start gap-1.5">
                <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {lastRejected.rejection_reason ??
                  'Les pièces fournies n’ont pas permis de valider votre identité.'}
              </p>
              <p className="mt-1.5 text-xs">Vous pouvez déposer une nouvelle demande corrigée.</p>
            </Alert>
          ) : null}

          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <h2 className="flex items-center gap-2 font-bold text-brand-900">
              <BadgeCheck className="size-5 text-brand-600" aria-hidden="true" />
              Pourquoi se faire vérifier ?
            </h2>
            <ul className="mt-3 space-y-1.5">
              {BENEFITS.map((benefit) => (
                <li key={benefit} className="flex gap-2 text-sm text-neutral-700">
                  <span className="text-brand-600" aria-hidden="true">
                    •
                  </span>
                  {benefit}
                </li>
              ))}
            </ul>
          </section>

          <div className="rounded-xl border border-neutral-200 bg-white p-5">
            <VerificationForm
              userId={user.id}
              defaultFullName={profile?.full_name ?? ''}
              defaultPhone={profile?.phone ?? null}
            />
          </div>
        </>
      )}

      {/* --------------------------- Historique complet -------------------------- */}
      {requests.length > 0 ? (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="mb-2 text-sm font-bold text-neutral-700">
            Historique
          </h2>
          <ul className="space-y-1.5">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-3.5 py-2.5 text-sm"
              >
                <span className="text-neutral-700">
                  {
                    {
                      pending: 'En attente',
                      approved: 'Approuvée',
                      rejected: 'Refusée',
                      cancelled: 'Annulée',
                    }[request.status]
                  }
                </span>
                <time dateTime={request.created_at} className="text-xs text-neutral-400">
                  {formatLongDate(request.created_at)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
