import 'server-only';

/**
 * Messagerie interne acheteur ↔ vendeur.
 *
 * La RLS garantit qu'un utilisateur ne lit que les messages dont il est
 * l'expéditeur ou le destinataire (`messages_select_participant`).
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { getPublicImageUrl } from '@/services/storage.service';
import type { Message } from '@/types';

/** Fil de discussion = une annonce + un interlocuteur. */
export interface Conversation {
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  listingReference: string;
  listingImageUrl: string | null;
  correspondentId: string;
  correspondentName: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

interface RawMessageRow extends Message {
  listing: {
    id: string;
    title: string;
    slug: string;
    reference: string;
    images: { storage_path: string; position: number }[] | null;
  } | null;
  sender: { id: string; full_name: string } | null;
  recipient: { id: string; full_name: string } | null;
}

const MESSAGE_WITH_CONTEXT = `
  id, listing_id, sender_id, recipient_id, body, read_at, created_at,
  listing:listings!messages_listing_id_fkey(
    id, title, slug, reference, images:listing_images(storage_path, position)
  ),
  sender:profiles!messages_sender_id_fkey(id, full_name),
  recipient:profiles!messages_recipient_id_fkey(id, full_name)
`;

/**
 * Regroupe les messages de l'utilisateur en conversations, la plus récente
 * en premier.
 */
export async function getConversations(userId: string): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_WITH_CONTEXT)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(400)
    .returns<RawMessageRow[]>();

  if (error) {
    logger.error('Chargement des conversations impossible', error, { userId });
    return [];
  }

  const conversations = new Map<string, Conversation>();

  for (const message of data ?? []) {
    const isRecipient = message.recipient_id === userId;
    const correspondent = isRecipient ? message.sender : message.recipient;
    if (!correspondent || !message.listing) continue;

    const key = `${message.listing_id}:${correspondent.id}`;
    const existing = conversations.get(key);

    if (existing) {
      // Les messages sont triés du plus récent au plus ancien : on n'ajoute
      // ici que le compteur de non-lus.
      if (isRecipient && message.read_at === null) existing.unreadCount += 1;
      continue;
    }

    const cover = [...(message.listing.images ?? [])].sort((a, b) => a.position - b.position)[0];

    conversations.set(key, {
      listingId: message.listing.id,
      listingTitle: message.listing.title,
      listingSlug: message.listing.slug,
      listingReference: message.listing.reference,
      listingImageUrl: getPublicImageUrl(cover?.storage_path),
      correspondentId: correspondent.id,
      correspondentName: correspondent.full_name,
      lastMessage: message.body,
      lastMessageAt: message.created_at,
      unreadCount: isRecipient && message.read_at === null ? 1 : 0,
    });
  }

  return [...conversations.values()].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** Messages d'un fil, du plus ancien au plus récent. */
export async function getThread(
  userId: string,
  listingId: string,
  correspondentId: string,
): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, listing_id, sender_id, recipient_id, body, read_at, created_at')
    .eq('listing_id', listingId)
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${correspondentId}),` +
        `and(sender_id.eq.${correspondentId},recipient_id.eq.${userId})`,
    )
    .order('created_at', { ascending: true })
    .returns<Message[]>();

  if (error) {
    logger.error('Chargement du fil de discussion impossible', error, { listingId });
    return [];
  }
  return data ?? [];
}

/** Nombre total de messages non lus (badge de navigation). */
export async function countUnreadMessages(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', userId)
    .is('read_at', null);

  return count ?? 0;
}
