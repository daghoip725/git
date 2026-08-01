import 'server-only';

/**
 * Centre de notifications.
 *
 * Les notifications sont créées exclusivement côté PostgreSQL, par la fonction
 * `public.create_notification()` (SECURITY DEFINER) appelée depuis les triggers
 * métier : nouveau message, nouvel avis, paiement, expiration d'annonce.
 * Aucun droit d'INSERT n'est accordé au client — un utilisateur ne peut donc
 * pas fabriquer une notification chez quelqu'un d'autre.
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Notification } from '@/types';

/** Notifications de l'utilisateur, plus récentes d'abord. */
export async function getNotifications(limit = 30): Promise<Notification[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, link, data, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<Notification[]>();

  if (error) {
    logger.error('Chargement des notifications impossible', error);
    return [];
  }
  return data ?? [];
}

/** Nombre de notifications non lues (index partiel dédié côté base). */
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('unread_notifications_count');

  if (error) {
    logger.error('Comptage des notifications impossible', error);
    return 0;
  }
  return data ?? 0;
}
