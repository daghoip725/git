'use client';

/**
 * Menu de navigation mobile (tiroir plein écran).
 * Le défilement de la page est bloqué tant que le tiroir est ouvert.
 */
import { LogIn, LogOut, Menu, Plus, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { signOutAction } from '@/app/actions/auth.actions';
import { Logo } from '@/components/common/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { MAIN_NAV } from '@/utils/constants';

export interface MobileMenuProps {
  isAuthenticated: boolean;
  fullName?: string | null;
}

const ACCOUNT_LINKS = [
  { href: '/compte', label: 'Tableau de bord' },
  { href: '/compte/annonces', label: 'Mes annonces' },
  { href: '/compte/favoris', label: 'Mes favoris' },
  { href: '/messages', label: 'Messages' },
  { href: '/compte/profil', label: 'Mon profil' },
];

export function MobileMenu({ isAuthenticated, fullName }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Referme le tiroir à chaque navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        className="rounded-lg p-2 text-white transition-colors hover:bg-white/10 md:hidden"
      >
        <Menu className="size-6" aria-hidden="true" />
      </button>

      <div
        className={cn(
          'fixed inset-0 z-50 md:hidden',
          open ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!open}
      >
        <div
          className={cn(
            'absolute inset-0 bg-neutral-900/50 transition-opacity',
            open ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setOpen(false)}
        />

        <nav
          aria-label="Navigation mobile"
          className={cn(
            'absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col bg-card shadow-2xl transition-transform duration-200',
            open ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="flex items-center justify-between border-b border-neutral-200 p-4">
            <Logo size={36} />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer le menu"
              className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <ButtonLink href="/annonces/nouvelle" variant="gold" fullWidth size="lg">
              <Plus className="size-5" aria-hidden="true" />
              Déposer une annonce
            </ButtonLink>

            <ul className="mt-6 space-y-1">
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="block rounded-lg px-3 py-3 font-semibold text-brand-900 transition-colors hover:bg-neutral-100"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="my-4 border-t border-neutral-200" />

            {isAuthenticated ? (
              <>
                {fullName ? (
                  <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                    {fullName}
                  </p>
                ) : null}
                <ul className="space-y-1">
                  {ACCOUNT_LINKS.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="block rounded-lg px-3 py-2.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <form action={signOutAction} className="mt-4">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50"
                  >
                    <LogOut className="size-4" aria-hidden="true" />
                    Se déconnecter
                  </button>
                </form>
              </>
            ) : (
              <div className="space-y-2">
                <ButtonLink href="/connexion" variant="outline" fullWidth>
                  <LogIn className="size-4" aria-hidden="true" />
                  Se connecter
                </ButtonLink>
                <ButtonLink href="/inscription" variant="primary" fullWidth>
                  Créer un compte
                </ButtonLink>
              </div>
            )}
          </div>
        </nav>
      </div>
    </>
  );
}
