'use server';

/**
 * Messagerie : envoi d'un message et marquage d'un fil comme lu.
 * L'autorisation d'écrire (annonce publiée, messagerie activée, destinataire
 * légitime) est appliquée par la politique RLS `messages_insert_sender`.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { messageSchema, toFieldErrors } from '@/utils/validation';

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

    const parsed = messageSchema.safeParse({
      listingId: formData.get('listingId'),
      recipientId: formData.get('recipientId'),
      body: formData.get('body'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    if (parsed.data.recipientId === user.id) {
      return { success: false, error: 'Vous ne pouvez pas vous écrire à vous-même.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.from('messages').insert({
      listing_id: parsed.data.listingId,
      sender_id: user.id,
      recipient_id: parsed.data.recipientId,
      body: parsed.data.body,
    });

    if (error) {
      logger.error('Envoi de message impossible', error, { userId: user.id });
      return fail(
        error,
        'Impossible d’envoyer le message. L’annonce n’accepte peut-être plus la messagerie.',
      );
    }

    revalidatePath('/messages');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Marque comme lus les messages reçus dans un fil donné. */
export async function markThreadAsReadAction(
  listingId: string,
  correspondentId: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const parsed = z
      .object({ listingId: z.string().uuid(), correspondentId: z.string().uuid() })
      .safeParse({ listingId, correspondentId });
    if (!parsed.success) return { success: false, error: 'Conversation introuvable.' };

    const supabase = await createClient();
    const { error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('listing_id', parsed.data.listingId)
      .eq('sender_id', parsed.data.correspondentId)
      .eq('recipient_id', user.id)
      .is('read_at', null);

    if (error) return fail(error, 'Impossible de marquer la conversation comme lue.');

    revalidatePath('/messages');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
