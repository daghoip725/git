import 'server-only';

/**
 * Offres, abonnements et paiements — côté lecture.
 *
 * Rappel du modèle de sécurité : le client ne CRÉE jamais un abonnement ni un
 * paiement (il fixerait lui-même l'offre ou le montant). Ces écritures
 * appartiennent au serveur, avec la clé `service_role`, à la réception du
 * callback de l'opérateur Mobile Money. Ce service n'expose donc que des
 * lectures.
 */
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Payment, Subscription, SubscriptionPlan } from '@/types';

/** Catalogue des offres actives, de la moins chère à la plus chère. */
export const getSubscriptionPlans = cache(async (): Promise<SubscriptionPlan[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('is_active', true)
    .order('position', { ascending: true });

  if (error) {
    logger.error('Chargement des offres impossible', error);
    return [];
  }
  return data ?? [];
});

export interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan | null;
}

/** Abonnement en cours de l'utilisateur, ou `null` s'il est au plan gratuit. */
export async function getActiveSubscription(userId: string): Promise<SubscriptionWithPlan | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plan:subscription_plans!subscriptions_plan_id_fkey(*)')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('current_period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
    .returns<SubscriptionWithPlan | null>();

  if (error) {
    logger.error('Chargement de l’abonnement impossible', error, { userId });
    return null;
  }
  return data;
}

/** Historique des paiements de l'utilisateur. */
export async function getPayments(userId: string, limit = 50): Promise<Payment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<Payment[]>();

  if (error) {
    logger.error('Chargement des paiements impossible', error, { userId });
    return [];
  }
  return data ?? [];
}
