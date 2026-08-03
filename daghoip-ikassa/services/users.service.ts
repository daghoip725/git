import 'server-only';

/**
 * Lecture des profils utilisateurs.
 *
 * Rappel sécurité : la lecture publique de `public.users` est restreinte **au
 * niveau des colonnes**. `phone`, `whatsapp` et `district` ne figurent pas dans
 * le GRANT SELECT public : les demander déclencherait une erreur 42501. Le
 * propriétaire récupère sa fiche complète via la RPC `get_my_profile`.
 */
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { PublicSeller, UserProfile } from '@/types';

/** Colonnes réellement accordées en lecture publique. */
const PUBLIC_COLUMNS =
  'id, full_name, avatar_path, city, province, bio, is_professional, is_verified, ' +
  'business_name, rating_average, rating_count, ads_count, created_at';

/** Profil public d'un vendeur. */
export const getPublicUser = cache(async (userId: string): Promise<PublicSeller | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('users')
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
 * Fiche complète du compte connecté, coordonnées privées incluses.
 * S'appuie sur la fonction `SECURITY DEFINER` `public.get_my_profile()`.
 */
export const getMyProfile = cache(async (): Promise<UserProfile | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_my_profile').returns<UserProfile | null>();

  if (error) {
    logger.error('Chargement du profil personnel impossible', error);
    return null;
  }
  return data ?? null;
});

/** L'utilisateur courant appartient-il à l'équipe de modération ? */
export const isStaff = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.rpc('is_staff');
  return Boolean(data);
});
