/**
 * Client Supabase pour le navigateur.
 *
 * Il n'utilise que la clé anonyme : toute autorisation réelle est appliquée par
 * les politiques RLS PostgreSQL (voir `supabase/schema.sql`).
 *
 * Note : pas de directive `'use client'` ici volontairement. Le module reste
 * neutre, ce qui permet aux modules isomorphes (`services/storage.service.ts`)
 * d'exposer des helpers utilisables des deux côtés. `createClient()` n'est
 * appelé, lui, que depuis des composants client.
 */
import { createBrowserClient } from '@supabase/ssr';

import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Retourne un client navigateur unique (singleton) pour préserver la session. */
export function createClient() {
  browserClient ??= createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return browserClient;
}
