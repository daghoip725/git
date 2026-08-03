'use server';

/**
 * Préférences de notification.
 *
 * Une seule écriture, en `upsert` : l'absence de ligne vaut « valeurs par
 * défaut », il n'y a donc rien à créer à l'inscription. La RLS et les
 * privilèges de colonnes garantissent qu'un compte ne touche que ses propres
 * réglages — `user_id` n'est pas dans le `GRANT UPDATE`.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const settingsSchema = z.object({
  emailMessages: z.boolean(),
  emailAdStatus: z.boolean(),
  emailReviews: z.boolean(),
  emailPayments: z.boolean(),
  emailSubscription: z.boolean(),
  /*
   * Le délai de grâce est proposé parmi quatre valeurs plutôt qu'en champ
   * libre : « 7 minutes » n'a de sens pour personne, et une liste fermée évite
   * d'avoir à valider une saisie qui n'apporte rien.
   */
  messageDelay: z.coerce
    .number()
    .int()
    .refine((value) => [0, 10, 30, 60].includes(value), {
      message: 'Délai non proposé.',
    }),
});

export async function saveNotificationSettingsAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const parsed = settingsSchema.safeParse({
      // Une case décochée n'est pas envoyée du tout : son absence vaut `false`.
      emailMessages: formData.get('emailMessages') === 'on',
      emailAdStatus: formData.get('emailAdStatus') === 'on',
      emailReviews: formData.get('emailReviews') === 'on',
      emailPayments: formData.get('emailPayments') === 'on',
      emailSubscription: formData.get('emailSubscription') === 'on',
      messageDelay: formData.get('messageDelay') ?? 10,
    });

    if (!parsed.success) {
      return { success: false, error: 'Réglages invalides.' };
    }

    const { error } = await supabase.from('notification_settings').upsert(
      {
        user_id: user.id,
        email_messages: parsed.data.emailMessages,
        email_ad_status: parsed.data.emailAdStatus,
        email_reviews: parsed.data.emailReviews,
        email_payments: parsed.data.emailPayments,
        email_subscription: parsed.data.emailSubscription,
        message_email_delay_minutes: parsed.data.messageDelay,
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      logger.error('Enregistrement des préférences impossible', error, { userId: user.id });
      return fail(error, 'Impossible d’enregistrer vos préférences.');
    }

    revalidatePath('/compte/notifications');
    return ok(null);
  } catch (error) {
    logger.error('Préférences de notification : échec', error);
    return fail(error, 'Impossible d’enregistrer vos préférences.');
  }
}
