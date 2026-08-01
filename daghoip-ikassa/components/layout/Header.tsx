import { Heart, Plus } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { Logo } from '@/components/common/Logo';
import { CategoryNav } from '@/components/layout/CategoryNav';
import { MobileMenu } from '@/components/layout/MobileMenu';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { SearchBar } from '@/components/layout/SearchBar';
import { UserMenu } from '@/components/layout/UserMenu';
import { ButtonLink } from '@/components/ui/Button';
import { isModerator } from '@/lib/auth/roles';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCategories } from '@/services/categories.service';
import { countUnreadMessages } from '@/services/conversations.service';
import { getAvatarUrl } from '@/services/storage.service';
import { getPublicUser } from '@/services/users.service';
import { MAIN_NAV } from '@/utils/constants';

/**
 * En-tête principal (Server Component).
 *
 * La session est lue côté serveur : pas de clignotement « connecté /
 * déconnecté » à l'hydratation. Sur mobile, la navigation est déportée dans une
 * barre d'onglets fixe en bas d'écran (`MobileTabBar`), plus accessible au
 * pouce qu'un menu en haut de page.
 */
export async function Header() {
  const user = await getCurrentUser();

  const [profile, unreadCount, staff, categories] = user
    ? await Promise.all([
        getPublicUser(user.id),
        countUnreadMessages(user.id),
        isModerator(),
        getCategories(),
      ])
    : [null, 0, false, await getCategories()];

  return (
    <>
      <header className="sticky top-0 z-40 bg-brand-700 shadow-lg shadow-brand-900/10">
        <div className="container-app">
          <div className="flex h-16 items-center gap-3 lg:h-18">
            <div className="shrink-0">
              <Logo inverted size={40} />
            </div>

            {/*
              Recherche intégrée à la barre, à partir de 1280 px seulement.
              En dessous, la rangée est déjà occupée par le logo, la navigation,
              le bouton de dépôt et le menu du compte : y insérer la recherche
              écrasait le champ de saisie. Elle passe alors sur sa propre ligne.
              Version compacte ici : ni catégorie ni ville, qui restent dans le
              bandeau d'accueil et sur la page de recherche.
            */}
            <div className="ml-2 hidden max-w-lg min-w-0 flex-1 lg:block">
              <Suspense fallback={<div className="h-11 rounded-xl bg-white/15" />}>
                <SearchBar showCity={false} />
              </Suspense>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {user ? (
                <Link
                  href="/compte/favoris"
                  aria-label="Mes favoris"
                  className="hidden rounded-lg p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white md:inline-flex"
                >
                  <Heart className="size-5" aria-hidden="true" />
                </Link>
              ) : null}

              <ButtonLink
                href="/annonces/nouvelle"
                variant="gold"
                className="hidden sm:inline-flex"
              >
                <Plus className="size-4.5" aria-hidden="true" />
                <span className="hidden lg:inline">Déposer une annonce</span>
                <span className="lg:hidden">Déposer</span>
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

          {/* Recherche pleine largeur sur sa propre ligne, en dessous de 1280 px. */}
          <div className="pb-3 lg:hidden">
            <Suspense fallback={<div className="h-11 rounded-xl bg-white/15" />}>
              <SearchBar categories={categories} />
            </Suspense>
          </div>
        </div>

        <CategoryNav categories={categories} secondaryLinks={MAIN_NAV} />
      </header>

      <MobileTabBar isAuthenticated={Boolean(user)} unreadCount={unreadCount} />
    </>
  );
}
