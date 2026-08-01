'use client';

/**
 * Menu du compte utilisateur (desktop). Fermeture au clic extérieur et à Échap.
 */
import { ChevronDown, Heart, LayoutDashboard, LogOut, MessageSquare, Settings } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { signOutAction } from '@/app/actions/auth.actions';
import { Avatar } from '@/components/common/Avatar';

export interface UserMenuProps {
  fullName: string;
  avatarUrl: string | null;
  unreadCount?: number;
}

const LINKS = [
  { href: '/compte', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/compte/annonces', label: 'Mes annonces', icon: LayoutDashboard },
  { href: '/compte/favoris', label: 'Mes favoris', icon: Heart },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/compte/profil', label: 'Mon profil', icon: Settings },
];

export function UserMenu({ fullName, avatarUrl, unreadCount = 0 }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-white/90 transition-colors hover:bg-white/10"
      >
        <span className="relative">
          <Avatar name={fullName} src={avatarUrl} size={32} />
          {unreadCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-gold-500 text-[10px] font-bold text-brand-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </span>
        <span className="hidden max-w-28 truncate lg:inline">{fullName.split(' ')[0]}</span>
        <ChevronDown className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-neutral-200 bg-white py-1.5 shadow-lg"
        >
          <p className="truncate px-4 py-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            {fullName}
          </p>

          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              <Icon className="size-4 text-neutral-500" aria-hidden="true" />
              {label}
              {href === '/messages' && unreadCount > 0 ? (
                <span className="ml-auto rounded-full bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              ) : null}
            </Link>
          ))}

          <form action={signOutAction} className="border-t border-neutral-200 pt-1.5">
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Se déconnecter
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
