'use server';

/**
 * Server Actions des aides à la rédaction et à la publication.
 *
 * Trois d'entre elles n'appellent aucun modèle : la suggestion de prix, la
 * détection de doublons et le nettoyage typographique sont calculés — en base
 * pour les deux premières, localement pour la troisième. Seules la rédaction et
 * la correction orthographique passent par un modèle de langage, et seulement
 * s'il est configuré.
 *
 * Toutes **suggèrent** : aucune n'écrit dans l'annonce. Le vendeur voit la
 * proposition et décide.
 */
import { z } from 'zod';

import { getAssistant } from '@/lib/ai';
import { tidyDescription, tidyTitle } from '@/lib/ai/tidy';
import { AppError, fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { LISTING_LIMITS } from '@/utils/constants';

/* -------------------------------------------------------------------------- */
/*  Suggestion de prix — calculée en base                                     */
/* -------------------------------------------------------------------------- */

export interface PriceSuggestion {
  /** Périmètre effectivement utilisé : dire « national » quand on n'a pas mieux. */
  scope: 'city' | 'province' | 'national';
  sampleSize: number;
  median: number;
  p25: number;
  p75: number;
}

const priceQuerySchema = z.object({
  categoryId: z.string().uuid(),
  city: z.string().max(80).optional(),
  condition: z
    .enum(['new', 'like_new', 'good', 'fair', 'for_parts'])
    .optional(),
});

/**
 * Fourchette de prix des annonces comparables.
 *
 * Renvoie `null` quand l'échantillon est trop mince : afficher une médiane sur
 * deux annonces donnerait au vendeur une fausse assurance.
 */
export async function suggestPriceAction(
  input: unknown,
): Promise<ActionResult<PriceSuggestion | null>> {
  try {
    const parsed = priceQuerySchema.safeParse(input);
    if (!parsed.success) return ok(null);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('suggest_price', {
      p_category_id: parsed.data.categoryId,
      p_city: parsed.data.city ?? null,
      p_condition: parsed.data.condition ?? null,
    });

    if (error) {
      logger.warn('Suggestion de prix indisponible', { code: error.code });
      return ok(null);
    }

    const row = data?.[0];
    if (!row) return ok(null);

    return ok({
      scope: row.scope,
      sampleSize: row.sample_size,
      median: row.median,
      p25: row.p25,
      p75: row.p75,
    });
  } catch (error) {
    logger.error('Suggestion de prix impossible', error);
    return ok(null);
  }
}

/* -------------------------------------------------------------------------- */
/*  Doublons — calculés en base                                               */
/* -------------------------------------------------------------------------- */

export interface DuplicateCandidate {
  id: string;
  title: string;
  slug: string;
  reference: string;
  price: number | null;
  city: string;
  sameSeller: boolean;
  score: number;
}

/**
 * Annonces ressemblantes, pour prévenir le vendeur avant qu'il ne republie.
 *
 * On ne bloque rien : deux annonces peuvent légitimement se ressembler. Le
 * message d'alerte se contente de demander « est-ce bien un nouvel article ? ».
 */
export async function findDuplicatesAction(
  adId: string,
): Promise<ActionResult<DuplicateCandidate[]>> {
  try {
    await requireUser();

    const parsed = z.string().uuid().safeParse(adId);
    if (!parsed.success) return ok([]);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('find_duplicate_ads', {
      p_ad_id: parsed.data,
      p_threshold: 0.6,
      p_limit: 5,
    });

    if (error) {
      logger.warn('Détection de doublons indisponible', { code: error.code });
      return ok([]);
    }

    return ok(
      (data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        slug: row.slug,
        reference: row.reference,
        price: row.price,
        city: row.city,
        sameSeller: row.same_seller,
        score: row.title_score,
      })),
    );
  } catch (error) {
    logger.error('Détection de doublons impossible', error);
    return ok([]);
  }
}

/* -------------------------------------------------------------------------- */
/*  Rédaction et correction                                                   */
/* -------------------------------------------------------------------------- */

const briefSchema = z.object({
  title: z.string().min(LISTING_LIMITS.titleMin).max(LISTING_LIMITS.titleMax),
  categoryName: z.string().min(1).max(80),
  city: z.string().min(1).max(80),
  condition: z.string().max(40).optional(),
  price: z.number().int().min(0).max(LISTING_LIMITS.priceMax).optional(),
  notes: z.string().max(1000).optional(),
});

/** Applique le quota d'appels au modèle, qui a un coût réel. */
function assertAiQuota(userId: string) {
  const rate = checkRateLimit(
    `aiAssist:${userId}`,
    RATE_LIMITS.aiAssist.limit,
    RATE_LIMITS.aiAssist.windowMs,
  );
  if (!rate.success) {
    throw new AppError(
      `Trop de demandes d’assistance. Réessayez dans ${Math.ceil(rate.retryAfter / 60)} minute(s).`,
      'RATE_LIMITED',
    );
  }
}

/**
 * Rédige une première version de description à partir de la fiche.
 *
 * Le résultat n'est qu'une proposition : le formulaire la place dans le champ,
 * le vendeur la relit, la modifie ou l'écarte.
 */
export async function writeDescriptionAction(input: unknown): Promise<ActionResult<string>> {
  try {
    const user = await requireUser();
    assertAiQuota(user.id);

    const assistant = getAssistant();
    if (!assistant) {
      throw new AppError(
        'L’assistant de rédaction n’est pas activé sur cette instance.',
        'AI_DISABLED',
      );
    }

    const parsed = briefSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError(
        'Renseignez au moins le titre, la catégorie et la ville avant de demander une rédaction.',
        'AI_BRIEF_INCOMPLETE',
      );
    }

    const result = await assistant.writeDescription(parsed.data);
    if (!result.ok) throw new AppError(result.message, 'AI_FAILED');

    return ok(result.text);
  } catch (error) {
    logger.error('Rédaction assistée impossible', error);
    return fail(error, 'La rédaction assistée a échoué. Réessayez.');
  }
}

/**
 * Corrige l'orthographe d'un texte.
 *
 * Le nettoyage typographique est appliqué **avant** l'appel au modèle : il est
 * gratuit, instantané et traite déjà les capitales criées, la ponctuation
 * répétée et l'espacement français. Le modèle n'a plus qu'à s'occuper de ce
 * qu'aucune règle ne sait faire.
 */
export async function proofreadAction(input: unknown): Promise<ActionResult<string>> {
  try {
    const user = await requireUser();

    const parsed = z
      .string()
      .min(LISTING_LIMITS.descriptionMin)
      .max(LISTING_LIMITS.descriptionMax)
      .safeParse(input);
    if (!parsed.success) {
      throw new AppError('Le texte à corriger est trop court ou trop long.', 'AI_INPUT');
    }

    const tidied = tidyDescription(parsed.data).text;

    const assistant = getAssistant();
    if (!assistant) {
      // Sans modèle, on rend tout de même le texte remis en forme : c'est moins
      // que promis, mais ce n'est pas rien, et cela évite un bouton mort.
      return ok(tidied);
    }

    assertAiQuota(user.id);

    const result = await assistant.proofread(tidied);
    if (!result.ok) throw new AppError(result.message, 'AI_FAILED');

    return ok(result.text);
  } catch (error) {
    logger.error('Correction impossible', error);
    return fail(error, 'La correction a échoué. Réessayez.');
  }
}

/**
 * Remise en forme purement locale, sans appel réseau.
 *
 * Toujours disponible, y compris sans assistant configuré.
 */
export async function tidyTextAction(
  title: string,
  description: string,
): Promise<ActionResult<{ title: string; description: string; changed: boolean }>> {
  const cleanTitle = tidyTitle(title ?? '');
  const cleanDescription = tidyDescription(description ?? '');

  return ok({
    title: cleanTitle.text,
    description: cleanDescription.text,
    changed: cleanTitle.changed || cleanDescription.changed,
  });
}
