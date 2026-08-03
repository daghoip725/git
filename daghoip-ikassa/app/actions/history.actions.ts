'use server';

/**
 * Historiques personnels : recherches et annonces consultées.
 *
 * Toutes ces actions sont **silencieuses pour un visiteur anonyme** — elles ne
 * lèvent pas, elles ne font simplement rien. C'est délibéré : elles sont
 * appelées en marge d'une recherche ou de l'ouverture d'une annonce, et un
 * historique indisponible ne doit jamais faire échouer l'action principale.
 * Côté navigateur, l'historique local prend alors le relais.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import type { Json } from '@/types/database';

const searchSchema = z.object({
  query: z.string().min(2).max(120),
  /*
   * Filtres retenus, sous forme de couples texte. Bornés à douze entrées et à
   * des valeurs courtes : cette charge utile est stockée telle quelle, elle ne
   * doit pas devenir un fourre-tout.
   */
  filters: z
    .record(z.string().max(40), z.string().max(120))
    .refine((value) => Object.keys(value).length <= 12, 'Trop de filtres.')
    .optional(),
  results: z.number().int().min(0).max(1_000_000).optional(),
});

/**
 * Enregistre une recherche.
 *
 * Appelée *après* l'affichage des résultats, jamais avant : le nombre de
 * résultats fait partie de ce qu'on réaffiche (« Toyota Corolla — 12 annonces »),
 * et attendre évite d'enregistrer une frappe intermédiaire.
 */
export async function recordSearchAction(input: unknown): Promise<void> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) return;

  try {
    const supabase = await createClient();
    await supabase.rpc('record_search', {
      p_query: parsed.data.query,
      p_filters: (parsed.data.filters ?? {}) as Json,
      p_results: parsed.data.results ?? null,
    });
  } catch (error) {
    // Un historique qui échoue ne doit pas se voir.
    logger.warn('Enregistrement de recherche impossible', { error: String(error) });
  }
}

/** Enregistre la consultation d'une annonce. */
export async function recordAdViewAction(adId: string): Promise<void> {
  const parsed = z.string().uuid().safeParse(adId);
  if (!parsed.success) return;

  try {
    const supabase = await createClient();
    await supabase.rpc('record_ad_view', { p_ad_id: parsed.data });
  } catch (error) {
    logger.warn('Enregistrement de consultation impossible', { error: String(error) });
  }
}

/** Supprime une recherche de l'historique. */
export async function deleteSearchAction(id: string): Promise<ActionResult<null>> {
  try {
    const parsed = z.string().uuid().safeParse(id);
    if (!parsed.success) return { success: false, error: 'Entrée introuvable.' };

    const supabase = await createClient();
    // La politique RLS filtre sur `auth.uid()` : inutile de refiltrer ici, et
    // le faire donnerait l'illusion que la sécurité est côté application.
    const { error } = await supabase.from('search_history').delete().eq('id', parsed.data);
    if (error) return fail(error, 'Suppression impossible.');

    revalidatePath('/compte/historique');
    return ok(null);
  } catch (error) {
    return fail(error, 'Suppression impossible.');
  }
}

/** Retire une annonce de l'historique de consultation. */
export async function deleteAdViewAction(adId: string): Promise<ActionResult<null>> {
  try {
    const parsed = z.string().uuid().safeParse(adId);
    if (!parsed.success) return { success: false, error: 'Annonce introuvable.' };

    const supabase = await createClient();
    const { error } = await supabase.from('ad_views').delete().eq('ad_id', parsed.data);
    if (error) return fail(error, 'Suppression impossible.');

    revalidatePath('/compte/historique');
    return ok(null);
  } catch (error) {
    return fail(error, 'Suppression impossible.');
  }
}

/**
 * Efface tout un historique.
 *
 * « Tout effacer » doit être un seul geste : obliger quelqu'un à supprimer
 * trente lignes une par une n'est pas lui donner le contrôle de ses données.
 */
export async function clearHistoryAction(
  scope: 'searches' | 'views',
): Promise<ActionResult<{ removed: number }>> {
  try {
    const parsed = z.enum(['searches', 'views']).safeParse(scope);
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc(
      parsed.data === 'searches' ? 'clear_search_history' : 'clear_ad_views',
    );

    if (error) {
      logger.error('Effacement d’historique impossible', error, { scope: parsed.data });
      return fail(error, 'Effacement impossible.');
    }

    revalidatePath('/compte/historique');
    return ok({ removed: data ?? 0 });
  } catch (error) {
    return fail(error, 'Effacement impossible.');
  }
}
