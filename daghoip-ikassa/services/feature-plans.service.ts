import 'server-only';

/**
 * Catalogue des offres de mise en avant (« annonce sponsorisée »).
 *
 * Le formulaire n'envoie qu'un **code** d'offre ; le montant réellement facturé
 * est relu côté base par `request_ad_feature()`. Ce service ne sert donc qu'à
 * afficher le catalogue : même si un client falsifiait le prix affiché, le
 * paiement créé porterait le tarif enregistré en base.
 */
import { cache } from 'react';

import { logger } from '@/lib/logger';
import { createClient } from '@/lib/supabase/server';
import type { AdFeaturePlan } from '@/types';

/** Offres actives, de la plus courte à la plus longue. */
export const getAdFeaturePlans = cache(async (): Promise<AdFeaturePlan[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ad_feature_plans')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) {
    // Une panne du catalogue ne doit pas empêcher de déposer une annonce :
    // le formulaire se contente alors de masquer la section sponsorisation.
    logger.error('Chargement des offres de mise en avant impossible', error);
    return [];
  }
  return data ?? [];
});
