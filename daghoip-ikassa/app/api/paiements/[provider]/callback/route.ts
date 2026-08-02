/**
 * Rappels des opérateurs Mobile Money.
 *
 * Cette route est **publique par construction** : c'est l'opérateur qui
 * l'appelle, sans session ni cookie. Toute la sécurité tient donc à la
 * signature du corps et au cloisonnement en base :
 *
 *   1. limitation de débit par IP — la route est exposée à l'Internet ;
 *   2. corps lu en **brut**, jamais reparsé avant vérification : la signature
 *      porte sur les octets reçus ;
 *   3. signature vérifiée par l'adaptateur de l'opérateur ;
 *   4. application par `apply_payment_callback()`, la seule fonction habilitée
 *      à faire changer un paiement de statut, et réservée à `service_role` ;
 *   5. idempotence garantie en base — les opérateurs rejouent leurs rappels.
 *
 * Un rappel refusé est tout de même **consigné** dans `payment_events` : c'est
 * ainsi qu'on constate après coup une clé mal configurée, ou un sondage.
 *
 * La réponse ne dit jamais si la référence existe : à un appelant non
 * authentifié, cela permettrait d'énumérer les paiements de la plateforme.
 */
import { NextResponse } from 'next/server';

import { logger } from '@/lib/logger';
import { getProvider } from '@/lib/payments/registry';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

/** Aucune mise en cache : chaque rappel doit atteindre la base. */
export const dynamic = 'force-dynamic';

/** Au-delà, le corps n'est pas un rappel d'opérateur mais une tentative d'engorgement. */
const MAX_BODY_BYTES = 32 * 1024;

/** Réponse volontairement muette : elle ne révèle rien de l'état interne. */
function acknowledged() {
  return NextResponse.json({ received: true }, { status: 200 });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider: providerCode } = await context.params;

  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  const rate = checkRateLimit(
    `paymentCallback:${ip}`,
    RATE_LIMITS.paymentCallback.limit,
    RATE_LIMITS.paymentCallback.windowMs,
  );
  if (!rate.success) {
    return NextResponse.json(
      { error: 'Trop de requêtes.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  const adapter = getProvider(providerCode);
  if (!adapter || !adapter.isConfigured()) {
    // 404 et non 400 : un opérateur non branché sur cette instance n'a pas à
    // savoir que la route existe.
    return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Charge utile trop volumineuse.' }, { status: 413 });
  }

  const verification = await adapter.verifyCallback({ rawBody, headers: request.headers });
  const parsed = adapter.parseCallback(rawBody);

  if (!parsed) {
    logger.warn('Rappel d’opérateur illisible', {
      provider: providerCode,
      signatureValid: verification.valid,
    });
    // 400 : le corps est inexploitable, il n'y a rien à consigner sous une
    // référence — l'opérateur doit corriger son envoi.
    return NextResponse.json({ error: 'Charge utile invalide.' }, { status: 400 });
  }

  if (!verification.valid) {
    logger.warn('Rappel d’opérateur à signature invalide', {
      provider: providerCode,
      reason: verification.reason,
      reference: parsed.reference,
    });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (error) {
    // Sans clé `service_role`, aucun rappel ne peut être appliqué. On répond en
    // erreur pour que l'opérateur réémette plus tard.
    logger.error('Clé service_role absente : rappel non traité', error, {
      provider: providerCode,
    });
    return NextResponse.json({ error: 'Service indisponible.' }, { status: 503 });
  }

  const { data, error } = await admin.rpc('apply_payment_callback', {
    p_reference: parsed.reference,
    p_provider: adapter.code,
    p_provider_reference: parsed.providerReference,
    p_status: parsed.status,
    p_payload: parsed.payload as never,
    p_failure_reason: parsed.failureReason,
    // La base consigne l'échec de signature et refuse d'appliquer : la
    // décision reste dans la même transaction que le journal.
    p_signature_valid: verification.valid,
  });

  if (error) {
    logger.error('Application du rappel impossible', error, {
      provider: providerCode,
      reference: parsed.reference,
    });
    // 500 : l'opérateur réémettra, et `apply_payment_callback` est idempotente.
    return NextResponse.json({ error: 'Traitement impossible.' }, { status: 500 });
  }

  const outcome = Array.isArray(data) ? data[0] : null;
  logger.info('Rappel d’opérateur traité', {
    provider: providerCode,
    reference: parsed.reference,
    signatureValid: verification.valid,
    applied: outcome?.applied ?? false,
    known: outcome?.payment_id !== null && outcome?.payment_id !== undefined,
  });

  return acknowledged();
}

/**
 * Certains opérateurs sondent l'URL en GET avant d'activer les rappels. On
 * répond, sans rien divulguer de l'état des paiements.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string }> },
): Promise<NextResponse> {
  const { provider } = await context.params;
  const adapter = getProvider(provider);

  if (!adapter || !adapter.isConfigured()) {
    return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  }
  return NextResponse.json({ status: 'ready' }, { status: 200 });
}
