'use server';

/**
 * Server Actions de gestion des annonces.
 *
 * Chaîne de contrôle, du plus applicatif au plus fondamental :
 *   1. session vérifiée (`requireUser`) ;
 *   2. rate limit par utilisateur ;
 *   3. revalidation Zod complète des entrées ;
 *   4. vérification que les chemins d'images appartiennent à l'appelant ;
 *   5. RLS + privilèges de colonnes PostgreSQL — l'autorité finale.
 *
 * Le quota d'annonces en ligne est appliqué par le trigger `enforce_ad_quota`
 * (erreur P0001), pas ici : impossible de le contourner en appelant l'API
 * directement.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { AppError, fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { AD_IMAGES_BUCKET, LISTING_LIMITS, findProvinceForCity } from '@/utils/constants';
import { buildListingHref } from '@/utils/slug';
import { listingFormSchema, toFieldErrors } from '@/utils/validation';

/** Un chemin Storage doit rester dans le dossier de l'utilisateur. */
const storagePathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|avif)$/i,
    'Chemin d’image invalide.',
  );

const createAdSchema = z.object({
  id: z.string().uuid(),
  imagePaths: z.array(storagePathSchema).max(LISTING_LIMITS.maxImages),
  publish: z.boolean().default(true),
});

/** Reconstruit les valeurs du formulaire depuis un FormData. */
function readAdForm(formData: FormData) {
  const rawPrice = formData.get('price');
  const price =
    typeof rawPrice === 'string' && rawPrice.trim() !== ''
      ? Number(rawPrice.replace(/\s/g, ''))
      : null;

  const nullableString = (key: string) => {
    const value = formData.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };

  return {
    title: formData.get('title'),
    description: formData.get('description'),
    categoryId: formData.get('categoryId'),
    priceType: formData.get('priceType'),
    price: Number.isFinite(price) ? price : null,
    condition: nullableString('condition'),
    city: formData.get('city'),
    district: nullableString('district'),
    contactPhone: formData.get('contactPhone') ?? '',
    contactWhatsapp: formData.get('contactWhatsapp') ?? '',
    allowMessages: formData.get('allowMessages') === 'on',
  };
}

/** Vérifie que chaque chemin d'image appartient à l'utilisateur et à l'annonce. */
function assertOwnedPaths(paths: string[], userId: string, adId: string) {
  const prefix = `${userId}/${adId}/`;
  for (const path of paths) {
    if (!path.startsWith(prefix)) {
      throw new AppError('Chemin d’image invalide.', 'INVALID_IMAGE_PATH');
    }
  }
}

export async function createAdAction(
  _prevState: ActionResult<{ href: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ href: string }>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(
      `createAd:${user.id}`,
      RATE_LIMITS.createListing.limit,
      RATE_LIMITS.createListing.windowMs,
    );
    if (!rate.success) {
      return {
        success: false,
        error: `Vous avez publié trop d’annonces récemment. Réessayez dans ${Math.ceil(rate.retryAfter / 60)} min.`,
      };
    }

    const meta = createAdSchema.safeParse({
      id: formData.get('listingId'),
      imagePaths: formData.getAll('imagePaths').map(String).filter(Boolean),
      publish: formData.get('publish') !== 'false',
    });
    if (!meta.success) {
      return { success: false, error: 'Requête invalide.', fieldErrors: toFieldErrors(meta.error) };
    }

    const parsed = listingFormSchema.safeParse(readAdForm(formData));
    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    assertOwnedPaths(meta.data.imagePaths, user.id, meta.data.id);

    const values = parsed.data;
    const supabase = await createClient();

    const { data: ad, error } = await supabase
      .from('ads')
      .insert({
        id: meta.data.id,
        seller_id: user.id,
        category_id: values.categoryId,
        title: values.title,
        description: values.description,
        price: values.priceType === 'free' ? 0 : values.price,
        price_type: values.priceType,
        condition: values.condition,
        city: values.city,
        province: findProvinceForCity(values.city),
        district: values.district,
        contact_phone: values.contactPhone,
        contact_whatsapp: values.contactWhatsapp,
        allow_messages: values.allowMessages,
        status: meta.data.publish ? 'published' : 'draft',
      })
      .select('slug, reference')
      .single();

    if (error || !ad) {
      logger.error('Création d’annonce impossible', error, { userId: user.id });
      // P0001 = quota atteint : le message du trigger est sûr à afficher.
      if (error?.code === 'P0001') {
        return { success: false, error: error.message };
      }
      return fail(error, 'Impossible de publier l’annonce. Veuillez réessayer.');
    }

    if (meta.data.imagePaths.length > 0) {
      const { error: imagesError } = await supabase.from('ad_images').insert(
        meta.data.imagePaths.map((storagePath, index) => ({
          ad_id: meta.data.id,
          storage_path: storagePath,
          position: index,
        })),
      );

      if (imagesError) {
        // L'annonce existe : on la conserve et on journalise l'incident.
        logger.error('Enregistrement des photos impossible', imagesError, { adId: meta.data.id });
      }
    }

    revalidatePath('/annonces');
    revalidatePath('/compte/annonces');
    revalidatePath('/');

    return ok({ href: buildListingHref(ad.slug, ad.reference) });
  } catch (error) {
    logger.error('createAdAction', error);
    return fail(error);
  }
}

export async function updateAdAction(
  _prevState: ActionResult<{ href: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ href: string }>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(
      `updateAd:${user.id}`,
      RATE_LIMITS.updateListing.limit,
      RATE_LIMITS.updateListing.windowMs,
    );
    if (!rate.success) {
      return { success: false, error: 'Trop de modifications. Réessayez dans un instant.' };
    }

    const adId = z.string().uuid().safeParse(formData.get('listingId'));
    if (!adId.success) return { success: false, error: 'Annonce introuvable.' };

    const parsed = listingFormSchema.safeParse(readAdForm(formData));
    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const newPaths = z
      .array(storagePathSchema)
      .max(LISTING_LIMITS.maxImages)
      .safeParse(formData.getAll('imagePaths').map(String).filter(Boolean));
    if (!newPaths.success) return { success: false, error: 'Photos invalides.' };

    assertOwnedPaths(newPaths.data, user.id, adId.data);

    const values = parsed.data;
    const supabase = await createClient();

    // La RLS restreint déjà l'UPDATE au propriétaire : pas de contrôle redondant.
    const { data: ad, error } = await supabase
      .from('ads')
      .update({
        category_id: values.categoryId,
        title: values.title,
        description: values.description,
        price: values.priceType === 'free' ? 0 : values.price,
        price_type: values.priceType,
        condition: values.condition,
        city: values.city,
        province: findProvinceForCity(values.city),
        district: values.district,
        contact_phone: values.contactPhone,
        contact_whatsapp: values.contactWhatsapp,
        allow_messages: values.allowMessages,
      })
      .eq('id', adId.data)
      .select('slug, reference')
      .single();

    if (error || !ad) {
      logger.error('Mise à jour d’annonce impossible', error, { adId: adId.data });
      return fail(error, 'Impossible de modifier l’annonce.');
    }

    // Synchronisation des photos : la liste envoyée fait foi.
    await supabase.from('ad_images').delete().eq('ad_id', adId.data);
    if (newPaths.data.length > 0) {
      await supabase.from('ad_images').insert(
        newPaths.data.map((storagePath, index) => ({
          ad_id: adId.data,
          storage_path: storagePath,
          position: index,
        })),
      );
    }

    const href = buildListingHref(ad.slug, ad.reference);
    revalidatePath(href);
    revalidatePath('/compte/annonces');
    revalidatePath('/annonces');

    return ok({ href });
  } catch (error) {
    logger.error('updateAdAction', error);
    return fail(error);
  }
}

/** Change le statut d'une annonce (vendue, remise en ligne, archivée). */
export async function setAdStatusAction(
  adId: string,
  status: 'published' | 'sold' | 'archived' | 'draft',
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsedId = z.string().uuid().safeParse(adId);
    if (!parsedId.success) return { success: false, error: 'Annonce introuvable.' };

    const supabase = await createClient();
    const { error } = await supabase
      .from('ads')
      .update({
        status,
        // Une remise en ligne repart pour un cycle complet de publication.
        ...(status === 'published'
          ? {
              expires_at: new Date(
                Date.now() + LISTING_LIMITS.publicationDays * 24 * 60 * 60 * 1000,
              ).toISOString(),
            }
          : {}),
      })
      .eq('id', parsedId.data);

    if (error) {
      logger.error('Changement de statut impossible', error, { adId });
      if (error.code === 'P0001') return { success: false, error: error.message };
      return fail(error, 'Impossible de modifier le statut de l’annonce.');
    }

    revalidatePath('/compte/annonces');
    revalidatePath('/annonces');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteAdAction(adId: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const parsedId = z.string().uuid().safeParse(adId);
    if (!parsedId.success) return { success: false, error: 'Annonce introuvable.' };

    const supabase = await createClient();

    // Chemins récupérés avant suppression, pour nettoyer le Storage.
    // Un trigger côté base fait déjà ce ménage : ceci en accélère l'effet.
    const { data: images } = await supabase
      .from('ad_images')
      .select('storage_path')
      .eq('ad_id', parsedId.data);

    const { error } = await supabase.from('ads').delete().eq('id', parsedId.data);
    if (error) {
      logger.error('Suppression d’annonce impossible', error, { adId });
      return fail(error, 'Impossible de supprimer l’annonce.');
    }

    const paths = (images ?? [])
      .map((image) => image.storage_path)
      .filter((path) => path.startsWith(`${user.id}/`));

    if (paths.length > 0) {
      const { error: storageError } = await supabase.storage.from(AD_IMAGES_BUCKET).remove(paths);
      if (storageError) {
        logger.warn('Nettoyage Storage incomplet', { adId, count: paths.length });
      }
    }

    revalidatePath('/compte/annonces');
    revalidatePath('/annonces');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Incrémente le compteur de vues (appelée depuis la page de détail). */
export async function incrementViewsAction(adId: string): Promise<void> {
  const parsedId = z.string().uuid().safeParse(adId);
  if (!parsedId.success) return;

  const supabase = await createClient();
  await supabase.rpc('increment_ad_views', { p_ad_id: parsedId.data });
}

/** Ajoute ou retire un favori (bascule atomique côté PostgreSQL). */
export async function toggleFavoriteAction(
  adId: string,
): Promise<ActionResult<{ isFavorite: boolean }>> {
  try {
    await requireUser();

    const parsedId = z.string().uuid().safeParse(adId);
    if (!parsedId.success) return { success: false, error: 'Annonce introuvable.' };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('toggle_favorite', { p_ad_id: parsedId.data });

    if (error) {
      logger.error('Bascule de favori impossible', error, { adId });
      return fail(error, 'Impossible de mettre à jour vos favoris.');
    }

    revalidatePath('/compte/favoris');
    return ok({ isFavorite: Boolean(data) });
  } catch (error) {
    return fail(error);
  }
}
