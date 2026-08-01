'use server';

/**
 * Mise à jour du profil utilisateur.
 * Les colonnes `role` et `is_verified` sont hors du `grant update (…)` côté
 * PostgreSQL : même une requête forgée ne peut pas les modifier.
 */
import { revalidatePath } from 'next/cache';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { findProvinceForCity } from '@/utils/constants';
import { profileSchema, toFieldErrors } from '@/utils/validation';

export async function updateProfileAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const nullable = (key: string) => {
      const value = formData.get(key);
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    };

    const parsed = profileSchema.safeParse({
      fullName: formData.get('fullName'),
      phone: formData.get('phone') ?? '',
      whatsapp: formData.get('whatsapp') ?? '',
      city: nullable('city'),
      province: nullable('province'),
      bio: nullable('bio'),
      isProfessional: formData.get('isProfessional') === 'on',
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const values = parsed.data;
    const supabase = await createClient();

    const { error } = await supabase
      .from('users')
      .update({
        full_name: values.fullName,
        phone: values.phone,
        whatsapp: values.whatsapp,
        city: values.city,
        province: values.city ? findProvinceForCity(values.city) : values.province,
        bio: values.bio,
        is_professional: values.isProfessional,
      })
      .eq('id', user.id);

    if (error) {
      logger.error('Mise à jour du profil impossible', error, { userId: user.id });
      return fail(error, 'Impossible de mettre à jour votre profil.');
    }

    revalidatePath('/compte');
    revalidatePath('/compte/profil');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
