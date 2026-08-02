import {
  BadgeCheck,
  Heart,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  MessageSquare,
  ShieldBan,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/supabase/server';

const NAV = [
  { href: '/compte', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/compte/annonces', label: 'Mes annonces', icon: ListOrdered },
  { href: '/compte/favoris', label: 'Mes favoris', icon: Heart },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/compte/profil', label: 'Mon profil', icon: User },
  { href: '/compte/verification', label: 'Vérification', icon: BadgeCheck },
  { href: '/compte/blocages', label: 'Comptes bloqués', icon: ShieldBan },
  { href: '/compte/mot-de-passe', label: 'Mot de passe', icon: KeyRound },
];

/**
 * Gabarit de l'espace personnel. Le middleware bloque déjà les visiteurs non
 * authentifiés ; la vérification ici est une seconde barrière.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte');

  return (
    <div className="container-app py-6 sm:py-10">
      <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-8">
        <nav aria-label="Navigation du compte" className="lg:sticky lg:top-32 lg:self-start">
          <ul className="no-scrollbar flex gap-1.5 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
            {NAV.map(({ href, label, icon: Icon }) => (
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
