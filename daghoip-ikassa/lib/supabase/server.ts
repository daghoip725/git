import 'server-only';

/**
 * Clients Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * La session est lue et rafraîchie via les cookies de la requête.
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Crée un client Supabase lié aux cookies de la requête courante.
 *
 * Dans un Server Component, l'écriture de cookies est interdite par Next.js :
 * l'exception est avalée car le rafraîchissement de session est déjà assuré par
 * le middleware (`lib/supabase/middleware.ts`).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Appelé depuis un Server Component : ignoré volontairement.
          }
        },
      },
    },
  );
}

/**
 * Utilisateur authentifié de la requête courante, ou `null`.
 *
 * `getUser()` (et non `getSession()`) est utilisé volontairement : il valide le
 * JWT auprès du serveur Supabase et ne fait pas confiance au cookie seul.
 * `cache()` déduplique l'appel sur l'ensemble du rendu d'une requête.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/**
 * Profil complet de l'utilisateur connecté, coordonnées privées incluses.
 *
 * Passe par la RPC `get_my_profile()` (SECURITY DEFINER) : la lecture directe
 * de `public.users` est restreinte par colonnes et n'exposerait ni `phone`
 * ni `whatsapp`, même à leur propriétaire.
 */
export const getCurrentProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc('get_my_profile');

  return data ?? null;
});

/**
 * Variante « garde » : lève une erreur si aucun utilisateur n'est authentifié.
 * À utiliser dans les Server Actions protégées.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('AUTH_REQUIRED');
  }
  return user;
}
