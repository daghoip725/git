import 'server-only';

/**
 * Lecture des profils.
 *
 * Rappel sécurité : la lecture publique de `profiles` est restreinte **au niveau
 * des colonnes** côté PostgreSQL. Les coordonnées privées (téléphone, WhatsApp)
 * ne sont accessibles qu'au propriétaire, via la RPC `get_my_profile`.
 */
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Profile, PublicSeller } from '@/types';

const PUBLIC_COLUMNS = 'id, full_name, avatar_url, city, is_professional, is_verified, created_at';

/** Profil public d'un vendeur (colonnes non sensibles uniquement). */
export const getPublicProfile = cache(async (userId: string): Promise<PublicSeller | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_COLUMNS)
    .eq('id', userId)
    .maybeSingle()
    .returns<PublicSeller | null>();

  if (error) {
    logger.error('Chargement du profil public impossible', error, { userId });
    return null;
  }
  return data;
});

/**
 * Fiche complète du profil connecté, coordonnées privées incluses.
 * S'appuie sur la fonction `SECURITY DEFINER` `public.get_my_profile()`.
 */
export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_profile').returns<Profile | null>();

  if (error) {
    logger.error('Chargement du profil personnel impossible', error);
    return null;
  }
  return data ?? null;
});

/** Nombre d'annonces publiées par un vendeur (indicateur de confiance). */
export async function countPublishedListings(sellerId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('listings')
    .select('id', { count: 'exact', head: true })
    .eq('seller_id', sellerId)
    .eq('status', 'published');

  return count ?? 0;
}
