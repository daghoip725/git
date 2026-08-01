/**
 * Rafraîchissement de la session Supabase dans le middleware Next.js.
 *
 * Le middleware s'exécute avant chaque rendu : il renouvelle le jeton d'accès
 * expiré et réécrit les cookies sur la réponse, ce qui évite aux Server
 * Components d'avoir à écrire des cookies (opération interdite chez eux).
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/** Préfixes de routes nécessitant une session authentifiée. */
const PROTECTED_PREFIXES = ['/compte', '/annonces/nouvelle', '/messages'];

/** Routes réservées aux visiteurs non connectés. */
const GUEST_ONLY_PREFIXES = ['/connexion', '/inscription', '/mot-de-passe-oublie'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANT : ne rien insérer entre la création du client et `getUser()`.
  // Cet appel déclenche le rafraîchissement du jeton et l'écriture des cookies.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/connexion';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && GUEST_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/compte';
    redirectUrl.search = '';
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
