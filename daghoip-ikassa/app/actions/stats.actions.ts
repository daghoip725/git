'use server';

/**
 * Mesure d'audience des annonces.
 *
 * Une seule action, et elle est **silencieuse** : comme l'enregistrement d'une
 * consultation, elle est déclenchée en marge d'un geste qui a sa propre valeur
 * — afficher un numéro, ouvrir WhatsApp, écrire au vendeur. Si la mesure
 * échoue, le geste doit aboutir quand même. Elle ne lève donc jamais et ne
 * renvoie rien d'exploitable côté interface.
 *
 * Ce qui est mesuré, et surtout ce qui ne l'est pas : la base ne conserve
 * aucune identité de visiteur. `record_ad_contact()` hache l'identifiant reçu
 * avec l'annonce et la date du jour, ne stocke que cette empreinte, et la purge
 * au bout de sept jours. Le vendeur apprend donc *combien* de personnes l'ont
 * contacté et *par quel canal*, jamais *qui*.
 */
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import type { ContactChannel } from '@/types/database';

const schema = z.object({
  adId: z.string().uuid(),
  channel: z.enum(['phone', 'whatsapp', 'message']),
  /*
   * Identifiant de session d'un visiteur non connecté. Opaque et généré par le
   * navigateur : il ne dit rien de la personne, il sert uniquement à ne pas
   * compter deux fois le même clic dans la journée. Borné en longueur pour que
   * l'appel ne devienne pas un canal d'écriture arbitraire.
   */
  visitor: z.string().min(8).max(64).optional(),
});

/**
 * Compte un contact pour une annonce.
 *
 * La base décide seule si le contact compte : annonce retirée, vendeur qui
 * consulte sa propre annonce, ou visiteur déjà compté aujourd'hui donnent
 * `false` sans erreur. Rien à traiter ici — d'où le retour `void`.
 */
export async function recordAdContactAction(input: {
  adId: string;
  channel: ContactChannel;
  visitor?: string;
}): Promise<void> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return;

  try {
    const supabase = await createClient();
    await supabase.rpc('record_ad_contact', {
      p_ad_id: parsed.data.adId,
      p_channel: parsed.data.channel,
      p_visitor: parsed.data.visitor ?? null,
    });
  } catch (error) {
    // Une mesure qui échoue ne doit pas se voir.
    logger.warn('Enregistrement de contact impossible', { error: String(error) });
  }
}
