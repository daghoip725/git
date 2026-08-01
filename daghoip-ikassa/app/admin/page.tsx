import { BadgeCheck, Flag, ShieldAlert, ShieldCheck, UserCog, Users } from 'lucide-react';
import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, requireRole } from '@/lib/auth/roles';
import { getAdminOverview } from '@/services/admin.service';
import type { UserRole } from '@/types';

export default async function AdminOverviewPage() {
  const role = await requireRole('moderator');
  const overview = await getAdminOverview();

  const cards = [
    { label: 'Comptes', value: overview.totalUsers, icon: Users, href: '/admin/utilisateurs' },
    {
      label: 'Signalements ouverts',
      value: overview.openReports,
      icon: Flag,
      href: '/admin/signalements',
      alert: overview.openReports > 0,
    },
    {
      label: 'Vérifications en attente',
      value: overview.pendingVerifications,
      icon: BadgeCheck,
      href: '/admin/verifications',
      alert: overview.pendingVerifications > 0,
    },
    {
      label: 'Vendeurs vérifiés',
      value: overview.verifiedCount,
      icon: ShieldCheck,
      href: '/admin/utilisateurs',
    },
    {
      label: 'Comptes restreints',
      value: overview.suspendedCount,
      icon: ShieldAlert,
      href: '/admin/utilisateurs?statut=suspended',
    },
    {
      label: 'Équipe',
      value: overview.staffCount,
      icon: UserCog,
      href: '/admin/utilisateurs?role=moderator',
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-300"
          >
            <card.icon
              className={card.alert ? 'size-5 text-red-600' : 'size-5 text-brand-600'}
              aria-hidden="true"
            />
            <p className="mt-2 text-2xl font-extrabold text-brand-900">
              {card.value.toLocaleString('fr-GA')}
            </p>
            <p className="text-xs text-neutral-600">{card.label}</p>
          </Link>
        ))}
      </div>

      {/* --------------------------- Rappel des rôles -------------------------- */}
      <section aria-labelledby="roles-title">
        <h2 id="roles-title" className="mb-3 text-lg font-bold text-brand-900">
          Périmètre des rôles
        </h2>

        <ul className="space-y-2">
          {(Object.keys(ROLE_LABELS) as UserRole[]).map((key) => (
            <li key={key} className="rounded-xl border border-neutral-200 bg-white p-4">
              <p className="font-semibold text-brand-900">{ROLE_LABELS[key]}</p>
              <p className="mt-0.5 text-sm text-neutral-600">{ROLE_DESCRIPTIONS[key]}</p>
            </li>
          ))}
        </ul>
      </section>

      {role !== 'admin' ? (
        <Alert tone="info" title="Certaines actions sont réservées aux administrateurs">
          La modification des rôles et l’action sur un autre membre de l’équipe demandent le rôle
          Administrateur. Le reste de la modération vous est accessible.
        </Alert>
      ) : null}

      <Alert tone="warning" title="Toute action sensible est journalisée">
        Changements de rôle, suspensions et décisions de vérification sont enregistrés dans le{' '}
        <Link href="/admin/journal" className="font-semibold underline underline-offset-2">
          journal d’audit
        </Link>{' '}
        avec leur auteur et leur horodatage.
      </Alert>
    </div>
  );
}
