'use server';

/**
 * Server Actions du parcours de paiement.
 *
 * Le principe tient en une phrase : **le navigateur n'envoie qu'un code
 * d'offre**. Le tarif est relu par `request_subscription()` /
 * `request_ad_feature()` dans le catalogue, qui fait seul foi. Aucune de ces
 * actions ne peut faire aboutir un paiement : seul `apply_payment_callback()`,
 * appelée depuis la route de rappel avec la clé `service_role`, en a le droit.
 *
 * Chaîne de contrôle :
 *   1. session vérifiée (`requireUser`) ;
 *   2. rate limit par utilisateur — chaque demande sonne un téléphone ;
 *   3. revalidation Zod des entrées ;
 *   4. RPC SECURITY DEFINER qui relit le prix et refuse les doublons ;
 *   5. appel à l'opérateur, dont l'échec ne casse jamais le paiement déjà créé.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { AppError, fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { getProvider, isAvailableProvider } from '@/lib/payments/registry';
import type { InitiationResult } from '@/lib/payments/types';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { toFieldErrors } from '@/utils/validation';

/** Ce que l'interface reçoit après l'ouverture d'un paiement. */
export interface CheckoutData {
  paymentId: string;
  reference: string;
  /** Ce que l'opérateur a répondu : à afficher tel quel au payeur. */
  initiation: InitiationResult;
}

const checkoutSchema = z.object({
  planCode: z
    .string()
    .min(1, 'Choisissez une offre.')
    .max(60)
    // Les codes d'offre sont des identifiants techniques : les borner évite
    // qu'une valeur exotique ne se retrouve dans une requête.
    .regex(/^[a-z0-9_-]+$/i, 'Offre inconnue.'),
  provider: z.string().refine(isAvailableProvider, 'Ce moyen de paiement n’est pas disponible.'),
  payerPhone: z.string().max(30).optional(),
});

const paymentIdSchema = z.string().uuid('Paiement introuvable.');

/**
 * Engage le paiement auprès de l'opérateur, une fois le paiement créé en base.
 *
 * Un échec ici **n'annule pas** le paiement : il reste en attente et le payeur
 * peut relancer depuis son historique. Perdre la trace d'une demande serait
 * bien pire que d'en laisser une inaboutie.
 */
async function initiateWithProvider(
  providerCode: string,
  payment: {
    id: string;
    reference: string;
    amount: number;
    currency: string;
    payer_phone: string | null;
  },
  label: string,
): Promise<InitiationResult> {
  const adapter = getProvider(providerCode);
  if (!adapter) {
    return { kind: 'error', message: 'Ce moyen de paiement n’est pas disponible.' };
  }

  try {
    return await adapter.initiate({
      id: payment.id,
      reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
      payerPhone: payment.payer_phone,
      label,
    });
  } catch (error) {
    logger.error('Engagement du paiement impossible', error, {
      provider: providerCode,
      reference: payment.reference,
    });
    return {
      kind: 'error',
      message:
        'La demande n’a pas pu être transmise à l’opérateur. Réessayez depuis votre historique.',
    };
  }
}

/** Relit le paiement qui vient d'être créé, pour le transmettre à l'adaptateur. */
async function readPayment(supabase: Awaited<ReturnType<typeof createClient>>, paymentId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select('id, reference, amount, currency, payer_phone, metadata')
    .eq('id', paymentId)
    .single();

  if (error || !data) {
    throw new AppError('Paiement introuvable.', 'PAYMENT_NOT_FOUND');
  }
  return data;
}

/**
 * Souscrit à une offre payante.
 *
 * `request_subscription()` refuse une seconde demande tant qu'une première est
 * en attente : un double clic ne peut pas ouvrir deux prélèvements.
 */
export async function startSubscriptionAction(
  _prev: ActionResult<CheckoutData> | null,
  formData: FormData,
): Promise<ActionResult<CheckoutData>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const rate = checkRateLimit(
      `startPayment:${user.id}`,
      RATE_LIMITS.startPayment.limit,
      RATE_LIMITS.startPayment.windowMs,
    );
    if (!rate.success) {
      throw new AppError(
        `Trop de demandes de paiement. Réessayez dans ${Math.ceil(rate.retryAfter / 60)} minute(s).`,
        'RATE_LIMITED',
      );
    }

    const parsed = checkoutSchema.safeParse({
      planCode: formData.get('planCode'),
      provider: formData.get('provider'),
      payerPhone: formData.get('payerPhone') ?? undefined,
    });
    if (!parsed.success) {
      return {
        success: false,
        error: 'Formulaire incomplet.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    const { data: paymentId, error } = await supabase.rpc('request_subscription', {
      p_plan_code: parsed.data.planCode,
      p_provider: parsed.data.provider,
      p_payer_phone: parsed.data.payerPhone ?? null,
    });
    if (error || !paymentId) {
      logger.warn('Ouverture d’un paiement d’abonnement refusée', {
        userId: user.id,
        planCode: parsed.data.planCode,
        code: error?.code,
      });
      return fail(error, 'Impossible d’ouvrir ce paiement.');
    }

    const payment = await readPayment(supabase, paymentId);
    const planName =
      typeof payment.metadata === 'object' &&
      payment.metadata !== null &&
      'plan_name' in payment.metadata
        ? String((payment.metadata as Record<string, unknown>).plan_name)
        : 'Abonnement';

    const initiation = await initiateWithProvider(
      parsed.data.provider,
      payment,
      `Daghoip Ikassa — ${planName}`,
    );

    revalidatePath('/compte/paiements');
    revalidatePath('/premium');

    return ok({ paymentId, reference: payment.reference, initiation });
  } catch (error) {
    logger.error('Souscription impossible', error);
    return fail(error, 'Impossible d’ouvrir ce paiement.');
  }
}

/**
 * Met une annonce en avant.
 *
 * Même chemin que l'abonnement, autre RPC : le tarif vient de
 * `ad_feature_plans`, et la RPC vérifie que l'annonce appartient bien au payeur.
 */
export async function startAdFeatureAction(
  _prev: ActionResult<CheckoutData> | null,
  formData: FormData,
): Promise<ActionResult<CheckoutData>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const rate = checkRateLimit(
      `startPayment:${user.id}`,
      RATE_LIMITS.startPayment.limit,
      RATE_LIMITS.startPayment.windowMs,
    );
    if (!rate.success) {
      throw new AppError(
        `Trop de demandes de paiement. Réessayez dans ${Math.ceil(rate.retryAfter / 60)} minute(s).`,
        'RATE_LIMITED',
      );
    }

    const adId = paymentIdSchema.safeParse(formData.get('adId'));
    const parsed = checkoutSchema.safeParse({
      planCode: formData.get('planCode'),
      provider: formData.get('provider'),
      payerPhone: formData.get('payerPhone') ?? undefined,
    });
    if (!adId.success || !parsed.success) {
      return {
        success: false,
        error: 'Formulaire incomplet.',
        ...(parsed.success ? {} : { fieldErrors: toFieldErrors(parsed.error) }),
      };
    }

    const { data: paymentId, error } = await supabase.rpc('request_ad_feature', {
      p_ad_id: adId.data,
      p_plan_code: parsed.data.planCode,
      p_provider: parsed.data.provider,
      p_payer_phone: parsed.data.payerPhone ?? null,
    });
    if (error || !paymentId) {
      logger.warn('Ouverture d’un paiement de mise en avant refusée', {
        userId: user.id,
        code: error?.code,
      });
      return fail(error, 'Impossible d’ouvrir ce paiement.');
    }

    const payment = await readPayment(supabase, paymentId);
    const initiation = await initiateWithProvider(
      parsed.data.provider,
      payment,
      'Daghoip Ikassa — Mise en avant',
    );

    revalidatePath('/compte/paiements');
    revalidatePath('/compte/annonces');

    return ok({ paymentId, reference: payment.reference, initiation });
  } catch (error) {
    logger.error('Mise en avant impossible', error);
    return fail(error, 'Impossible d’ouvrir ce paiement.');
  }
}

/**
 * Annule un paiement encore en attente.
 *
 * La RPC vérifie la propriété et le statut : un paiement abouti ne s'annule
 * pas d'un clic, cela relèverait du remboursement.
 */
export async function cancelPaymentAction(
  _prev: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    await requireUser();
    const supabase = await createClient();

    const parsed = paymentIdSchema.safeParse(formData.get('paymentId'));
    if (!parsed.success) {
      return { success: false, error: 'Paiement introuvable.' };
    }

    const { error } = await supabase.rpc('cancel_payment', { p_payment_id: parsed.data });
    if (error) {
      return fail(error, 'Ce paiement ne peut plus être annulé.');
    }

    revalidatePath('/compte/paiements');
    return ok(null);
  } catch (error) {
    logger.error('Annulation de paiement impossible', error);
    return fail(error, 'Ce paiement ne peut plus être annulé.');
  }
}

/**
 * Relance l'opérateur pour un paiement resté en attente.
 *
 * Utile quand le premier appel n'a pas abouti (réseau, opérateur injoignable)
 * ou quand le payeur a laissé expirer la demande sur son téléphone. Aucun
 * nouveau paiement n'est créé : on réengage celui qui existe déjà.
 */
export async function retryPaymentAction(
  _prev: ActionResult<InitiationResult> | null,
  formData: FormData,
): Promise<ActionResult<InitiationResult>> {
  try {
    const user = await requireUser();
    const supabase = await createClient();

    const rate = checkRateLimit(
      `startPayment:${user.id}`,
      RATE_LIMITS.startPayment.limit,
      RATE_LIMITS.startPayment.windowMs,
    );
    if (!rate.success) {
      throw new AppError(
        `Trop de demandes de paiement. Réessayez dans ${Math.ceil(rate.retryAfter / 60)} minute(s).`,
        'RATE_LIMITED',
      );
    }

    const parsed = paymentIdSchema.safeParse(formData.get('paymentId'));
    if (!parsed.success) {
      return { success: false, error: 'Paiement introuvable.' };
    }

    // La RLS restreint déjà la lecture au payeur : inutile de refiltrer, mais
    // le statut, lui, doit être vérifié — on ne réengage pas un paiement clos.
    const { data, error } = await supabase
      .from('payments')
      .select('id, reference, amount, currency, payer_phone, provider, status')
      .eq('id', parsed.data)
      .single();

    if (error || !data) {
      return { success: false, error: 'Paiement introuvable.' };
    }
    if (data.status !== 'pending') {
      return { success: false, error: 'Ce paiement n’est plus en attente.' };
    }

    const initiation = await initiateWithProvider(data.provider, data, 'Daghoip Ikassa');
    revalidatePath('/compte/paiements');
    return ok(initiation);
  } catch (error) {
    logger.error('Relance de paiement impossible', error);
    return fail(error, 'Relance impossible pour le moment.');
  }
}
