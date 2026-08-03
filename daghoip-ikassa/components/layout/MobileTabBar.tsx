'use client';

/**
 * Barre d'onglets fixe en bas de l'écran (mobile uniquement).
 *
 * C'est le schéma de navigation attendu sur les marketplaces mobiles : les
 * actions principales restent à portée du pouce, sans avoir à remonter en haut
 * de page. Le bouton central de publication est volontairement surdimensionné,
 * c'est l'action que le site cherche à provoquer.
 */
import { Heart, Home, MessageSquare, Plus, Search, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/utils/cn';

export interface MobileTabBarProps {
  isAuthenticated: boolean;
  unreadCount?: number;
}

export function MobileTabBar({ isAuthenticated, unreadCount = 0 }: MobileTabBarProps) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'Accueil', icon: Home },
    { href: '/annonces', label: 'Rechercher', icon: Search },
    { href: '/compte/favoris', label: 'Favoris', icon: Heart },
    {
      href: isAuthenticated ? '/messages' : '/connexion?next=%2Fmessages',
      label: 'Messages',
      icon: MessageSquare,
      badge: unreadCount,
    },
    { href: isAuthenticated ? '/compte' : '/connexion', label: 'Compte', icon: User },
  ];

  const isActive = (href: string) => {
    const base = href.split('?')[0] ?? href;
    return base === '/' ? pathname === '/' : pathname.startsWith(base);
  };

  return (
    <>
      {/*
        Cale de la hauteur de la barre : sans elle, la barre fixe masquerait la
        fin du contenu (footer, dernier bouton d'un formulaire).
      */}
      <div className="h-16 md:hidden" aria-hidden="true" />

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="relative grid grid-cols-5">
          {tabs.map((tab, index) => (
            <li key={tab.href} className={cn(index === 2 && 'invisible')}>
              <Link
                href={tab.href}
                aria-current={isActive(tab.href) ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  isActive(tab.href) ? 'text-brand-800' : 'text-neutral-500',
                )}
              >
                <span className="relative">
                  <tab.icon className="size-5.5" aria-hidden="true" />
                  {tab.badge && tab.badge > 0 ? (
                    <span className="absolute -top-1.5 -right-2 flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  ) : null}
                </span>
                {tab.label}
              </Link>
            </li>
          ))}

          {/* Bouton de publication, en surplomb au centre. */}
          <li className="pointer-events-none absolute inset-x-0 -top-5 flex justify-center">
            <Link
              href="/annonces/nouvelle"
              className="pointer-events-auto flex size-14 flex-col items-center justify-center rounded-full bg-gold-500 text-brand-ink shadow-lg ring-4 shadow-gold-500/40 ring-white transition-transform active:scale-95"
            >
              <Plus className="size-6" aria-hidden="true" />
              <span className="sr-only">Déposer une annonce</span>
            </Link>
          </li>
        </ul>
      </nav>
    </>
  );
}
