import 'server-only';

/**
 * Moov Money Gabon.
 *
 * Voir l'avertissement d'intégration en tête de `mobile-money.ts`. L'API de
 * collecte de Moov est moins documentée publiquement que celle d'Airtel : les
 * chemins et noms de champs retenus ici sont une **hypothèse de travail**
 * fondée sur la forme habituelle de ces passerelles. Ils doivent être
 * confrontés à la documentation contractuelle avant toute mise en service ;
 * seuls la mécanique commune (jeton, collecte, rappel signé) et le
 * rapprochement par référence sont acquis.
 */
import { getServerEnv } from '@/lib/env';
import {
  createMobileMoneyProvider,
  type MobileMoneyCredentials,
} from '@/lib/payments/providers/mobile-money';
import type { ParsedCallback } from '@/lib/payments/types';
import type { PaymentStatus } from '@/types/database';

function toPaymentStatus(raw: unknown): PaymentStatus {
  const code = String(raw ?? '').toUpperCase();
  if (code === 'SUCCESS' || code === 'SUCCESSFUL' || code === 'COMPLETED') return 'succeeded';
  if (code === 'PENDING' || code === 'PROCESSING' || code === 'INITIATED') return 'processing';
  if (code === 'CANCELLED' || code === 'CANCELED') return 'cancelled';
  return 'failed';
}

function readCredentials(): MobileMoneyCredentials | null {
  const env = getServerEnv();
  if (
    !env.MOOV_MONEY_BASE_URL ||
    !env.MOOV_MONEY_CLIENT_ID ||
    !env.MOOV_MONEY_CLIENT_SECRET ||
    !env.MOOV_MONEY_CALLBACK_SECRET
  ) {
    return null;
  }
  return {
    baseUrl: env.MOOV_MONEY_BASE_URL,
    clientId: env.MOOV_MONEY_CLIENT_ID,
    clientSecret: env.MOOV_MONEY_CLIENT_SECRET,
    callbackSecret: env.MOOV_MONEY_CALLBACK_SECRET,
  };
}

export const moovMoneyProvider = createMobileMoneyProvider({
  code: 'moov_money',
  label: 'Moov Money',
  hint: 'Vous recevrez une demande de confirmation sur votre téléphone.',

  tokenPath: '/oauth/token',
  collectPath: '/v1/collections',
  signatureHeader: 'x-moov-signature',
  timestampHeader: 'x-moov-timestamp',

  readCredentials,

  buildCollectBody: (intent, msisdn) => ({
    externalId: intent.reference,
    amount: intent.amount,
    currency: intent.currency,
    payer: { partyIdType: 'MSISDN', partyId: msisdn },
    payerMessage: intent.label,
    payeeNote: intent.reference,
  }),

  readProviderReference: (payload) => {
    const id = payload.transactionId ?? payload.referenceId;
    return typeof id === 'string' ? id : null;
  },

  parseCallback: (payload): ParsedCallback | null => {
    const reference = payload.externalId ?? payload.reference;
    if (typeof reference !== 'string' || reference === '') return null;

    const status = toPaymentStatus(payload.status);
    const providerReference = payload.transactionId ?? payload.financialTransactionId;

    return {
      reference,
      status,
      providerReference: typeof providerReference === 'string' ? providerReference : null,
      failureReason:
        status === 'failed' && typeof payload.reason === 'string' ? payload.reason : null,
      payload,
    };
  },
});
