import 'server-only';

/**
 * Offres, abonnements et paiements — côté lecture.
 *
 * Rappel du modèle de sécurité. Le client n'écrit jamais directement dans
 * `payments` ni `subscriptions` : il fixerait lui-même le montant. Il ouvre un
 * paiement par `request_subscription()` / `request_ad_feature()`, qui relisent
 * le tarif au catalogue ; et seul le serveur, avec la clé `service_role`, peut
 * constater un encaissement à la réception du rappel de l'opérateur. Ce service
 * n'expose donc que des lectures — les écritures vivent dans
 * `app/actions/payments.actions.ts` et dans la route de rappel.
 */
import { cache } from 'react';

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type {
  Payment,
  PaymentProvider,
  PaymentPurpose,
  Subscription,
  SubscriptionPlan,
} from '@/types';

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

/** Un paiement précis. `null` s'il n'existe pas ou n'appartient pas à l'appelant. */
export async function getPayment(paymentId: string): Promise<Payment | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .maybeSingle()
    .returns<Payment | null>();

  if (error) {
    logger.error('Chargement du paiement impossible', error, { paymentId });
    return null;
  }
  return data;
}

/** Ce que porte une facture, tel que le renvoie `get_invoice()`. */
export interface Invoice {
  invoice_number: string | null;
  invoiced_at: string | null;
  reference: string;
  amount: number;
  currency: string;
  purpose: PaymentPurpose;
  provider: PaymentProvider;
  paid_at: string | null;
  payer_name: string | null;
  payer_city: string | null;
  designation: string;
}

/**
 * Facture d'un paiement abouti.
 *
 * La fonction SQL est `security invoker` : c'est la RLS de `payments` qui
 * décide qui voit quoi — le payeur voit la sienne, le personnel les voit
 * toutes, personne d'autre n'obtient de ligne. Aucun filtre à ajouter ici.
 */
export async function getInvoice(paymentId: string): Promise<Invoice | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_invoice', { p_payment_id: paymentId });

  if (error) {
    logger.error('Chargement de la facture impossible', error, { paymentId });
    return null;
  }
  return data?.[0] ?? null;
}
