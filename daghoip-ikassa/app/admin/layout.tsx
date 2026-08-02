import {
  BadgeCheck,
  Banknote,
  BarChart3,
  CreditCard,
  FileText,
  Flag,
  FolderTree,
  LayoutDashboard,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { ROLE_LABELS, requireRole } from '@/lib/auth/roles';
import { countAdsPendingReview, countOpenReports } from '@/services/admin.service';
import { countPendingVerifications } from '@/services/verification.service';

export const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
};

/**
 * Gabarit de l'espace d'administration.
 *
 * `requireRole('moderator')` masque la section aux non-habilités, mais ce n'est
 * qu'un confort d'affichage : chaque action passe par une RPC PostgreSQL qui
 * revérifie `is_staff()` ou `is_admin()`. Forcer l'URL ne donne donc accès à
 * rien — les listes reviendraient vides et les actions seraient refusées.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const role = await requireRole('moderator');

  const [pendingVerifications, openReports, pendingAds] = await Promise.all([
    countPendingVerifications(),
    countOpenReports(),
    countAdsPendingReview(),
  ]);

  const nav = [
    { href: '/admin', label: 'Vue d’ensemble', icon: LayoutDashboard, count: 0 },
    { href: '/admin/statistiques', label: 'Statistiques', icon: BarChart3, count: 0 },
    { href: '/admin/signalements', label: 'Signalements', icon: Flag, count: openReports },
    {
      href: '/admin/verifications',
      label: 'Vérifications',
      icon: BadgeCheck,
      count: pendingVerifications,
    },
    { href: '/admin/annonces', label: 'Annonces', icon: FileText, count: pendingAds },
    { href: '/admin/utilisateurs', label: 'Utilisateurs', icon: Users, count: 0 },
    { href: '/admin/categories', label: 'Catégories', icon: FolderTree, count: 0 },
    { href: '/admin/paiements', label: 'Paiements', icon: Banknote, count: 0 },
    { href: '/admin/abonnements', label: 'Abonnements', icon: CreditCard, count: 0 },
    { href: '/admin/parametres', label: 'Paramètres', icon: Settings, count: 0 },
    { href: '/admin/journal', label: 'Journal d’audit', icon: ScrollText, count: 0 },
  ];

  return (
    <div className="container-app py-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-900">Administration</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Vous êtes connecté en tant que <strong>{ROLE_LABELS[role]}</strong>.
          </p>
        </div>
        <Badge tone={role === 'admin' ? 'gold' : 'brand'}>{ROLE_LABELS[role]}</Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-8">
        <nav
          aria-label="Navigation de l’administration"
          className="lg:sticky lg:top-32 lg:self-start"
        >
          <ul className="no-scrollbar flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {nav.map(({ href, label, icon: Icon, count }) => (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap text-neutral-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                >
                  <Icon className="size-4.5 shrink-0 text-neutral-500" aria-hidden="true" />
                  {label}
                  {count > 0 ? (
                    <span className="ml-auto rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700">
                      {count}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
