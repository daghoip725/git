import 'server-only';

/**
 * Messagerie acheteur ↔ vendeur.
 *
 * Le modèle repose sur `conversations` (un fil par couple annonce/acheteur) et
 * `messages`. Les compteurs de non-lus et l'aperçu du dernier message sont
 * dénormalisés par trigger : afficher la liste des fils ne coûte donc qu'une
 * seule requête, sans jointure latérale.
 *
 * La RLS garantit qu'un utilisateur ne voit que les fils dont il est acheteur
 * ou vendeur.
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getAdImageUrl, getAvatarUrl } from '@/services/storage.service';
import type { ConversationRow, ConversationSummary, Message } from '@/types';

/** Transforme une ligne de `conversations_view` selon le point de vue courant. */
function toSummary(row: ConversationRow, userId: string): ConversationSummary {
  const isSeller = row.seller_id === userId;

  return {
    id: row.id,
    adId: row.ad_id,
    adTitle: row.ad_title,
    adSlug: row.ad_slug,
    adReference: row.ad_reference,
    adImageUrl: getAdImageUrl(row.ad_cover_image_path),
    correspondentId: isSeller ? row.buyer_id : row.seller_id,
    correspondentName: isSeller ? row.buyer_name : row.seller_name,
    correspondentAvatarUrl: getAvatarUrl(isSeller ? row.buyer_avatar_path : row.seller_avatar_path),
    lastMessage: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: isSeller ? row.seller_unread_count : row.buyer_unread_count,
    isSeller,
  };
}

/**
 * Fils de l'utilisateur, le plus récemment actif en premier.
 *
 * `archived` sélectionne la boîte de réception ou les archives — chaque partie
 * archivant de son côté, le filtre dépend du rôle occupé dans le fil.
 */
export async function getConversations(
  userId: string,
  options: { archived?: boolean } = {},
): Promise<ConversationSummary[]> {
  const supabase = await createClient();
  const archived = options.archived ?? false;

  const query = supabase
    .from('conversations_view')
    .select('*')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .or(
      `and(buyer_id.eq.${userId},buyer_archived.eq.${archived}),` +
        `and(seller_id.eq.${userId},seller_archived.eq.${archived})`,
    );

  const { data, error } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)
    .returns<ConversationRow[]>();

  if (error) {
    logger.error('Chargement des conversations impossible', error, { userId });
    return [];
  }

  return (data ?? []).map((row) => toSummary(row, userId));
}

/** Un fil précis, ou `null` si l'utilisateur n'y participe pas. */
export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations_view')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle()
    .returns<ConversationRow | null>();

  if (error) {
    logger.error('Chargement de la conversation impossible', error, { conversationId });
    return null;
  }
  return data ? toSummary(data, userId) : null;
}

/**
 * Le fil courant est-il archivé du point de vue de l'utilisateur ?
 * L'information ne figure pas dans `ConversationSummary`, qui est orienté
 * affichage de liste ; la page du fil en a besoin pour son bouton.
 */
export async function isConversationArchived(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('conversations')
    .select('seller_id, buyer_archived, seller_archived')
    .eq('id', conversationId)
    .maybeSingle();

  if (!data) return false;
  return data.seller_id === userId ? data.seller_archived : data.buyer_archived;
}

/** Un blocage court-il entre l'utilisateur et son correspondant ? */
export async function isBlockedWith(otherUserId: string, userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('is_blocked_between', {
    p_a: userId,
    p_b: otherUserId,
  });

  if (error) {
    logger.error('Vérification de blocage impossible', error, { otherUserId });
    return false;
  }
  return Boolean(data);
}

/** L'utilisateur a-t-il lui-même bloqué ce compte ? (pour proposer « Débloquer ») */
export async function hasBlocked(otherUserId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocked_id', otherUserId)
    .maybeSingle();

  return Boolean(data);
}

/** Comptes bloqués par l'utilisateur courant. */
export async function getBlockedUsers() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_blocked_users');

  if (error) {
    logger.error('Chargement des comptes bloqués impossible', error);
    return [];
  }
  return data ?? [];
}

/** Messages d'un fil, du plus ancien au plus récent. */
export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, attachment_path, read_at, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .returns<Message[]>();

  if (error) {
    logger.error('Chargement des messages impossible', error, { conversationId });
    return [];
  }
  return data ?? [];
}

/**
 * Nombre total de messages non lus, pour le badge de navigation.
 * La somme est calculée sur les compteurs dénormalisés : aucun parcours de la
 * table `messages`.
 */
export async function countUnreadMessages(userId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .select('buyer_id, seller_id, buyer_unread_count, seller_unread_count')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  if (error) {
    logger.error('Comptage des messages non lus impossible', error, { userId });
    return 0;
  }

  return (data ?? []).reduce(
    (total, row) =>
      total + (row.seller_id === userId ? row.seller_unread_count : row.buyer_unread_count),
    0,
  );
}
