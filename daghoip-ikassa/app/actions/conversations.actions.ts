'use server';

/**
 * Messagerie : ouverture d'un fil, envoi d'un message, accusé de lecture.
 *
 * L'ouverture et l'envoi passent par des RPC PostgreSQL déclarées
 * `security invoker` : la RLS (`conversations_insert_buyer`,
 * `messages_insert_participant`) reste l'autorité. Les compteurs de non-lus,
 * l'aperçu du dernier message et la notification du destinataire sont produits
 * par trigger, donc jamais oubliés — même si l'écriture vient d'ailleurs.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { toFieldErrors } from '@/utils/validation';

const bodySchema = z
  .string()
  .trim()
  .min(1, 'Le message ne peut pas être vide.')
  .max(2000, 'Le message ne peut pas dépasser 2000 caractères.');

/**
 * Ouvre (ou retrouve) le fil avec le vendeur d'une annonce, puis y poste le
 * premier message. Utilisée depuis la page de détail d'une annonce.
 */
export async function startConversationAction(
  _prevState: ActionResult<{ conversationId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ conversationId: string }>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(
      `sendMessage:${user.id}`,
      RATE_LIMITS.sendMessage.limit,
      RATE_LIMITS.sendMessage.windowMs,
    );
    if (!rate.success) {
      return { success: false, error: 'Trop de messages envoyés. Réessayez plus tard.' };
    }

    const parsed = z
      .object({ adId: z.string().uuid(), body: bodySchema })
      .safeParse({ adId: formData.get('adId'), body: formData.get('body') });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const supabase = await createClient();

    const { data: conversationId, error: conversationError } = await supabase.rpc(
      'get_or_create_conversation',
      { p_ad_id: parsed.data.adId },
    );

    if (conversationError || !conversationId) {
      logger.error('Ouverture de conversation impossible', conversationError, {
        adId: parsed.data.adId,
      });
      return fail(
        conversationError,
        'Impossible d’ouvrir la discussion. L’annonce n’accepte peut-être plus la messagerie.',
      );
    }

    const { error: messageError } = await supabase.rpc('send_message', {
      p_conversation_id: conversationId,
      p_body: parsed.data.body,
    });

    if (messageError) {
      logger.error('Envoi du premier message impossible', messageError, { conversationId });
      return fail(messageError, 'Impossible d’envoyer le message.');
    }

    revalidatePath('/messages');
    return ok({ conversationId });
  } catch (error) {
    logger.error('startConversationAction', error);
    return fail(error);
  }
}

/** Poste un message dans un fil existant. */
export async function sendMessageAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(
      `sendMessage:${user.id}`,
      RATE_LIMITS.sendMessage.limit,
      RATE_LIMITS.sendMessage.windowMs,
    );
    if (!rate.success) {
      return { success: false, error: 'Trop de messages envoyés. Réessayez plus tard.' };
    }

    const parsed = z.object({ conversationId: z.string().uuid(), body: bodySchema }).safeParse({
      conversationId: formData.get('conversationId'),
      body: formData.get('body'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc('send_message', {
      p_conversation_id: parsed.data.conversationId,
      p_body: parsed.data.body,
    });

    if (error) {
      logger.error('Envoi de message impossible', error, { userId: user.id });
      return fail(error, 'Impossible d’envoyer le message.');
    }

    revalidatePath('/messages');
    revalidatePath(`/messages/${parsed.data.conversationId}`);
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Marque comme lus les messages reçus dans un fil. */
export async function markConversationReadAction(
  conversationId: string,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsedId = z.string().uuid().safeParse(conversationId);
    if (!parsedId.success) return { success: false, error: 'Conversation introuvable.' };

    const supabase = await createClient();
    const { error } = await supabase.rpc('mark_conversation_read', {
      p_conversation_id: parsedId.data,
    });

    if (error) return fail(error, 'Impossible de marquer la conversation comme lue.');

    revalidatePath('/messages');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Archive ou désarchive un fil, du point de vue de l'utilisateur courant. */
export async function setConversationArchivedAction(
  conversationId: string,
  archived: boolean,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const parsedId = z.string().uuid().safeParse(conversationId);
    if (!parsedId.success) return { success: false, error: 'Conversation introuvable.' };

    const supabase = await createClient();

    // Le GRANT UPDATE ne porte que sur les deux indicateurs d'archivage :
    // il faut donc savoir de quel côté du fil se trouve l'utilisateur.
    const { data: conversation } = await supabase
      .from('conversations')
      .select('buyer_id, seller_id')
      .eq('id', parsedId.data)
      .maybeSingle();

    if (!conversation) return { success: false, error: 'Conversation introuvable.' };

    const patch =
      conversation.seller_id === user.id
        ? { seller_archived: archived }
        : { buyer_archived: archived };

    const { error } = await supabase.from('conversations').update(patch).eq('id', parsedId.data);
    if (error) return fail(error, 'Impossible d’archiver la conversation.');

    revalidatePath('/messages');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
