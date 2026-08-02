import {
  BadgeCheck,
  Banknote,
  BarChart3,
  CreditCard,
  FileText,
  Flag,
  FolderTree,
  Settings,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import Link from 'next/link';

import { StatTile } from '@/components/charts/StatTile';
import { Alert } from '@/components/ui/Alert';
import { ROLE_DESCRIPTIONS, ROLE_LABELS, requireRole } from '@/lib/auth/roles';
import { getAdminKpis } from '@/services/admin.service';
import type { UserRole } from '@/types';
import { formatPrice } from '@/utils/format';

/** Raccourcis vers les sections, dans l'ordre où on s'en sert au quotidien. */
const SECTIONS = [
  {
    href: '/admin/statistiques',
    label: 'Statistiques',
    icon: BarChart3,
    description: 'Évolution sur 30 jours, répartitions par catégorie et par ville.',
  },
  {
    href: '/admin/signalements',
    label: 'Signalements',
    icon: Flag,
    description: 'Annonces, comptes, messages et avis signalés par les utilisateurs.',
  },
  {
    href: '/admin/annonces',
    label: 'Annonces',
    icon: FileText,
    description: 'Tous statuts confondus : archiver, refuser avec motif, republier.',
  },
  {
    href: '/admin/verifications',
    label: 'Vérifications',
    icon: BadgeCheck,
    description: 'Demandes de badge vendeur vérifié, pièces justificatives à l’appui.',
  },
  {
    href: '/admin/utilisateurs',
    label: 'Utilisateurs',
    icon: Users,
    description: 'Rôles, suspensions, badge vérifié.',
  },
  {
    href: '/admin/categories',
    label: 'Catégories',
    icon: FolderTree,
    description: 'Arborescence à deux niveaux, activation et ordre d’affichage.',
  },
  {
    href: '/admin/paiements',
    label: 'Paiements',
    icon: Banknote,
    description: 'Encaissements Mobile Money, en consultation seule.',
  },
  {
    href: '/admin/abonnements',
    label: 'Abonnements',
    icon: CreditCard,
    description: 'Souscriptions en cours, échéances et renouvellements.',
  },
  {
    href: '/admin/parametres',
    label: 'Paramètres',
    icon: Settings,
    description: 'Tarifs, quotas et limites de la plateforme.',
  },
];

export default async function AdminOverviewPage() {
  const role = await requireRole('moderator');
  const kpis = await getAdminKpis();

  return (
    <div className="space-y-8">
      {kpis ? (
        <section aria-labelledby="kpi-title">
          <h2 id="kpi-title" className="mb-3 text-lg font-bold text-brand-900">
            En un coup d’œil
          </h2>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTile
              label="Comptes"
              value={kpis.total_users}
              icon={Users}
              hint={`${kpis.new_users_30d.toLocaleString('fr-GA')} depuis 30 jours`}
              href="/admin/utilisateurs"
            />
            <StatTile
              label="Annonces publiées"
              value={kpis.published_ads}
              icon={FileText}
              hint={`${kpis.new_ads_30d.toLocaleString('fr-GA')} déposées depuis 30 jours`}
              href="/admin/annonces?statut=published"
            />
            <StatTile
              label="Recettes (30 j)"
              value={formatPrice(kpis.revenue_30d) ?? '0 FCFA'}
              icon={Banknote}
              href="/admin/paiements"
            />
            <StatTile
              label="Signalements ouverts"
              value={kpis.open_reports}
              icon={Flag}
              tone={kpis.open_reports > 0 ? 'alert' : 'default'}
              href="/admin/signalements"
            />
            <StatTile
              label="Annonces à revoir"
              value={kpis.pending_review_ads}
              icon={FileText}
              tone={kpis.pending_review_ads > 0 ? 'alert' : 'default'}
              href="/admin/annonces?statut=pending_review"
            />
            <StatTile
              label="Vérifications en attente"
              value={kpis.pending_verifications}
              icon={BadgeCheck}
              tone={kpis.pending_verifications > 0 ? 'alert' : 'default'}
              href="/admin/verifications"
            />
            <StatTile
              label="Vendeurs vérifiés"
              value={kpis.verified_users}
              icon={ShieldCheck}
              href="/admin/utilisateurs"
            />
            <StatTile
              label="Comptes restreints"
              value={kpis.suspended_users}
              icon={ShieldAlert}
              tone={kpis.suspended_users > 0 ? 'alert' : 'default'}
              href="/admin/utilisateurs?statut=suspended"
            />
            <StatTile
              label="Équipe"
              value={kpis.staff_users}
              icon={UserCog}
              href="/admin/utilisateurs?role=moderator"
            />
          </div>
        </section>
      ) : (
        <Alert tone="error" title="Indicateurs indisponibles">
          Les compteurs n’ont pas pu être chargés. Les sections restent accessibles ci-dessous.
        </Alert>
      )}

      {/* ----------------------------- Sections ----------------------------- */}
      <section aria-labelledby="sections-title">
        <h2 id="sections-title" className="mb-3 text-lg font-bold text-brand-900">
          Sections
        </h2>

        <ul className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map(({ href, label, icon: Icon, description }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex h-full gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-300"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
                <span>
                  <span className="block font-semibold text-brand-900">{label}</span>
                  <span className="mt-0.5 block text-sm text-neutral-600">{description}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

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
          La modification des rôles, des tarifs et l’action sur un autre membre de l’équipe
          demandent le rôle Administrateur. Le reste de la modération vous est accessible.
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
