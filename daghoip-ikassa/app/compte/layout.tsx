import {
  BadgeCheck,
  Bell,
  History,
  CreditCard,
  Heart,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  MessageSquare,
  Settings,
  ShieldBan,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getTranslations } from '@/lib/i18n/server';
import { getCurrentUser } from '@/lib/supabase/server';

/**
 * Gabarit de l'espace personnel. Le middleware bloque déjà les visiteurs non
 * authentifiés ; la vérification ici est une seconde barrière.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte');

  // Les libellés viennent du catalogue : c'est la partie de l'interface la
  // plus constamment sous les yeux, elle doit suivre la langue choisie.
  const dict = await getTranslations();
  const t = dict.account;

  const nav = [
    { href: '/compte', label: t.dashboard, icon: LayoutDashboard },
    { href: '/compte/annonces', label: t.myAds, icon: ListOrdered },
    { href: '/compte/favoris', label: t.favorites, icon: Heart },
    { href: '/compte/historique', label: t.history, icon: History },
    { href: '/messages', label: dict.nav.messages, icon: MessageSquare },
    { href: '/compte/profil', label: t.profile, icon: User },
    { href: '/compte/paiements', label: t.payments, icon: CreditCard },
    { href: '/compte/notifications', label: t.notifications, icon: Bell },
    { href: '/compte/verification', label: t.verification, icon: BadgeCheck },
    { href: '/compte/blocages', label: t.blocked, icon: ShieldBan },
    { href: '/compte/mot-de-passe', label: t.password, icon: KeyRound },
    { href: '/compte/parametres', label: t.settings, icon: Settings },
  ];

  return (
    <div className="container-app py-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-8">
        <nav aria-label={t.navLabel} className="lg:sticky lg:top-32 lg:self-start">
          <ul className="no-scrollbar flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {nav.map(({ href, label, icon: Icon }) => (
              <li key={href} className="shrink-0">
                <Link
                  href={href}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap text-neutral-700 transition-colors hover:bg-brand-50 hover:text-brand-800"
                >
                  <Icon className="size-4.5 shrink-0 text-neutral-500" aria-hidden="true" />
                  {label}
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
