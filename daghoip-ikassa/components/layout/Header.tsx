import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { Logo } from '@/components/common/Logo';
import { MobileMenu } from '@/components/layout/MobileMenu';
import { SearchBar } from '@/components/layout/SearchBar';
import { UserMenu } from '@/components/layout/UserMenu';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { countUnreadMessages } from '@/services/conversations.service';
import { getAvatarUrl } from '@/services/storage.service';
import { getPublicUser } from '@/services/users.service';
import { isModerator } from '@/lib/auth/roles';
import { MAIN_NAV } from '@/utils/constants';

/**
 * En-tête principal (Server Component) : lit la session côté serveur pour
 * éviter tout clignotement « connecté / déconnecté » à l'hydratation.
 */
export async function Header() {
  const user = await getCurrentUser();
  const [profile, unreadCount, staff] = user
    ? await Promise.all([getPublicUser(user.id), countUnreadMessages(user.id), isModerator()])
    : [null, 0, false];

  return (
    <header className="sticky top-0 z-40 bg-brand-700 shadow-md">
      <div className="container-app">
        <div className="flex h-16 items-center gap-3 lg:h-18">
          <div className="shrink-0">
            <Logo inverted size={40} />
          </div>

          <nav aria-label="Navigation principale" className="ml-4 hidden md:block">
            <ul className="flex items-center gap-1">
              {MAIN_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-white/90 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ButtonLink
              href="/annonces/nouvelle"
              variant="gold"
              size="md"
              className="hidden sm:inline-flex"
            >
              <Plus className="size-4.5" aria-hidden="true" />
              Déposer une annonce
            </ButtonLink>

            {user && profile ? (
              <UserMenu
                fullName={profile.full_name}
                avatarUrl={getAvatarUrl(profile.avatar_path)}
                unreadCount={unreadCount}
                isStaff={staff}
              />
            ) : (
              <div className="hidden items-center gap-2 md:flex">
                <ButtonLink
                  href="/connexion"
                  variant="ghost"
                  className="text-white hover:bg-white/10"
                >
                  Connexion
                </ButtonLink>
                <ButtonLink href="/inscription" variant="secondary">
                  Inscription
                </ButtonLink>
              </div>
            )}

            <MobileMenu isAuthenticated={Boolean(user)} fullName={profile?.full_name} />
          </div>
        </div>

        {/* Barre de recherche : pleine largeur sur mobile, sous la nav sur desktop. */}
        <div className="pb-3 lg:pb-4">
          <Suspense fallback={<div className="h-11 rounded-xl bg-white/20 lg:h-11" />}>
            <SearchBar className="mx-auto max-w-3xl" />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
