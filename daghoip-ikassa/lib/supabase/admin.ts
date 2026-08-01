import 'server-only';

/**
 * Client Supabase « service role ».
 *
 * ⚠️ Ce client **contourne toutes les politiques RLS**. Il ne doit servir qu'aux
 * tâches d'administration exécutées côté serveur (modération, expiration des
 * annonces, scripts de maintenance) et jamais dans un chemin de code atteignable
 * par un utilisateur non authentifié sans contrôle d'autorisation explicite.
 *
 * L'import de `server-only` fait échouer le build si ce module est référencé
 * depuis un composant client.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

import { getServerEnv, publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let adminClient: ReturnType<typeof createSupabaseClient<Database>> | undefined;

export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY est requise pour les opérations d’administration.');
  }

  adminClient ??= createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );

  return adminClient;
}
