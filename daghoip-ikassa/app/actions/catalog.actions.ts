'use server';

/**
 * Catalogue de la plateforme : catégories et offres.
 *
 * Ces écritures ne portent aucune garde applicative de rôle — la RLS s'en
 * charge : `categories_write_staff` exige `is_staff()`, les deux tables
 * d'offres exigent `is_admin()`. Un appel forgé par un compte ordinaire est
 * donc refusé par PostgreSQL, que cette action existe ou non.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { toFieldErrors } from '@/utils/validation';

/** Message sûr pour un refus de la base : jamais la requête, jamais un id. */
function toCatalogError(error: { code?: string } | null): string {
  if (error?.code === '42501') return 'Action réservée à l’administration.';
  if (error?.code === '23505') return 'Ce code ou ce raccourci est déjà utilisé.';
  return 'Enregistrement impossible. Réessayez dans un instant.';
}

/* -------------------------------------------------------------------------- */
/*  Catégories                                                                */
/* -------------------------------------------------------------------------- */

const categorySchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(60),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Le raccourci ne peut contenir que des minuscules, chiffres et tirets.'),
  icon: z.string().trim().max(40).nullable(),
  parentId: z.string().uuid().nullable(),
  position: z.coerce.number().int().min(0).max(999),
  isActive: z.boolean(),
});

function readCategoryForm(formData: FormData) {
  const value = (key: string) => {
    const raw = formData.get(key);
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
  };

  return {
    id: value('id'),
    name: formData.get('name'),
    slug: value('slug') ?? '',
    icon: value('icon'),
    parentId: value('parentId'),
    position: value('position') ?? '0',
    isActive: formData.get('isActive') === 'on',
  };
}

/** Crée ou met à jour une catégorie. */
export async function saveCategoryAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = categorySchema.safeParse(readCategoryForm(formData));
    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const { id, name, slug, icon, parentId, position, isActive } = parsed.data;

    // Une catégorie ne peut pas être son propre parent : la contrainte n'existe
    // pas en base (elle n'empêcherait pas les cycles plus longs), mais ce
    // cas-là est le seul qu'un formulaire puisse produire par inadvertance.
    if (id && parentId === id) {
      return { success: false, error: 'Une catégorie ne peut pas être son propre parent.' };
    }

    const supabase = await createClient();
    const payload = {
      name,
      slug,
      icon,
      parent_id: parentId,
      position,
      is_active: isActive,
    };

    const { error } = id
      ? await supabase.from('categories').update(payload).eq('id', id)
      : await supabase.from('categories').insert(payload);

    if (error) {
      logger.warn('Enregistrement de catégorie refusé', { code: error.code });
      return { success: false, error: toCatalogError(error) };
    }

    revalidatePath('/admin/categories');
    revalidatePath('/categories');
    revalidatePath('/', 'layout');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/**
 * Supprime une catégorie.
 *
 * La suppression échoue si des annonces y sont rattachées — la clé étrangère
 * l'interdit, et c'est heureux : effacer une catégorie ne doit pas emporter les
 * annonces qu'elle contient. Désactiver est presque toujours le bon geste.
 */
export async function deleteCategoryAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsedId = z.string().uuid().safeParse(id);
    if (!parsedId.success) return { success: false, error: 'Catégorie introuvable.' };

    const supabase = await createClient();
    const { error } = await supabase.from('categories').delete().eq('id', parsedId.data);

    if (error) {
      if (error.code === '23503') {
        return {
          success: false,
          error:
            'Cette catégorie contient des annonces ou des sous-catégories. Désactivez-la plutôt que de la supprimer.',
        };
      }
      return { success: false, error: toCatalogError(error) };
    }

    revalidatePath('/admin/categories');
    revalidatePath('/categories');
    revalidatePath('/', 'layout');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Offres                                                                    */
/* -------------------------------------------------------------------------- */

const subscriptionPlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  price: z.coerce.number().int().min(0).max(10_000_000),
  maxActiveAds: z.coerce.number().int().min(1).max(10_000),
  featuredQuota: z.coerce.number().int().min(0).max(1_000),
  isActive: z.boolean(),
});

/** Met à jour une offre d'abonnement (tarif, quotas, activation). */
export async function saveSubscriptionPlanAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = subscriptionPlanSchema.safeParse({
      id: formData.get('id'),
      name: formData.get('name'),
      price: formData.get('price'),
      maxActiveAds: formData.get('maxActiveAds'),
      featuredQuota: formData.get('featuredQuota'),
      isActive: formData.get('isActive') === 'on',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('subscription_plans')
      .update({
        name: parsed.data.name,
        price: parsed.data.price,
        max_active_ads: parsed.data.maxActiveAds,
        featured_ads_quota: parsed.data.featuredQuota,
        is_active: parsed.data.isActive,
      })
      .eq('id', parsed.data.id);

    if (error) {
      logger.warn('Mise à jour d’offre refusée', { code: error.code });
      return { success: false, error: toCatalogError(error) };
    }

    revalidatePath('/admin/parametres');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

const featurePlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(60),
  price: z.coerce.number().int().min(0).max(10_000_000),
  durationDays: z.coerce.number().int().min(1).max(90),
  isActive: z.boolean(),
});

/** Met à jour une offre de mise en avant. */
export async function saveFeaturePlanAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = featurePlanSchema.safeParse({
      id: formData.get('id'),
      name: formData.get('name'),
      price: formData.get('price'),
      durationDays: formData.get('durationDays'),
      isActive: formData.get('isActive') === 'on',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('ad_feature_plans')
      .update({
        name: parsed.data.name,
        price: parsed.data.price,
        duration_days: parsed.data.durationDays,
        is_active: parsed.data.isActive,
      })
      .eq('id', parsed.data.id);

    if (error) {
      logger.warn('Mise à jour d’offre de mise en avant refusée', { code: error.code });
      return { success: false, error: toCatalogError(error) };
    }

    revalidatePath('/admin/parametres');
    revalidatePath('/annonces/nouvelle');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
