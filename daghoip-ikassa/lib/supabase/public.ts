import 'server-only';

/**
 * Client Supabase **sans session**, pour le code qui s'exécute hors requête.
 *
 * Le client de `server.ts` lit les cookies : il ne peut donc pas servir dans
 * `generateSitemaps()` ou `generateStaticParams()`, qui tournent au build,
 * hors de tout contexte de requête. Next.js lève alors une erreur explicite —
 * « `cookies` was called outside a request scope ».
 *
 * Ce client utilise la clé **anonyme**, jamais `service_role` : le plan du site
 * ne liste que ce qu'un visiteur peut déjà voir. Les politiques RLS
 * s'appliquent donc pleinement, et une erreur de requête ici ne peut pas faire
 * fuiter une annonce en brouillon ou un compte suspendu.
 *
 * À n'utiliser que pour de la **lecture publique**. Toute donnée liée à une
 * personne passe par `createClient()` et sa session.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let cached: ReturnType<typeof createSupabaseClient<Database>> | undefined;

export function createPublicClient() {
  cached ??= createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    // Aucune session à conserver ni à rafraîchir : ce client n'authentifie
    // personne, et lui laisser gérer un stockage de session au build n'aurait
    // aucun sens.
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  return cached;
}
