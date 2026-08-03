'use server';

/**
 * Notifications : accusé de lecture et suppression.
 *
 * Aucune action de création : les notifications naissent exclusivement des
 * triggers PostgreSQL (`create_notification`, SECURITY DEFINER). Le client n'a
 * pas de droit d'INSERT sur la table — il ne peut donc pas en fabriquer une
 * chez un autre utilisateur.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

/** Marque comme lues les notifications indiquées, ou toutes si aucun id. */
export async function markNotificationsReadAction(
  ids?: string[],
): Promise<ActionResult<{ count: number }>> {
  try {
    await requireUser();

    const parsed = z.array(z.string().uuid()).max(200).optional().safeParse(ids);
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('mark_notifications_read', {
      p_ids: parsed.data ?? undefined,
    });

    if (error) return fail(error, 'Impossible de mettre à jour vos notifications.');

    revalidatePath('/compte/notifications');
    revalidatePath('/', 'layout');
    return ok({ count: data ?? 0 });
  } catch (error) {
    return fail(error);
  }
}

export async function deleteNotificationAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false, error: 'Notification introuvable.' };

    const supabase = await createClient();
    const { error } = await supabase.from('notifications').delete().eq('id', parsedId.data);

    if (error) return fail(error, 'Impossible de supprimer la notification.');

    revalidatePath('/compte/notifications');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
