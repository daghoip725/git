'use server';

/**
 * Ajout / retrait d'un favori.
 * La bascule est atomique côté PostgreSQL (`public.toggle_favorite`), ce qui
 * évite les états incohérents en cas de double clic.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

export async function toggleFavoriteAction(
  listingId: string,
): Promise<ActionResult<{ isFavorite: boolean }>> {
  try {
    await requireUser();

    const parsedId = z.string().uuid().safeParse(listingId);
    if (!parsedId.success) return { success: false, error: 'Annonce introuvable.' };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('toggle_favorite', {
      p_listing_id: parsedId.data,
    });

    if (error) {
      logger.error('Bascule de favori impossible', error, { listingId });
      return fail(error, 'Impossible de mettre à jour vos favoris.');
    }

    revalidatePath('/compte/favoris');
    return ok({ isFavorite: Boolean(data) });
  } catch (error) {
    return fail(error);
  }
}
