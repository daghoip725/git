import 'server-only';

/**
 * Airtel Money Gabon.
 *
 * Voir l'avertissement d'intégration en tête de `mobile-money.ts` : cet
 * adaptateur est complet dans sa forme mais n'a pas été éprouvé contre l'API
 * réelle, faute de contrat marchand. Les chemins et noms de champs ci-dessous
 * reprennent la forme publique de l'API Collection d'Airtel et sont à
 * confronter à la documentation contractuelle avant mise en service.
 */
import { getServerEnv } from '@/lib/env';
import {
  createMobileMoneyProvider,
  type MobileMoneyCredentials,
} from '@/lib/payments/providers/mobile-money';
import type { ParsedCallback } from '@/lib/payments/types';
import type { PaymentStatus } from '@/types/database';

/** Correspondance des statuts Airtel vers l'énumération maison. */
function toPaymentStatus(raw: unknown): PaymentStatus {
  const code = String(raw ?? '').toUpperCase();
  if (code === 'TS' || code === 'SUCCESS' || code === 'SUCCESSFUL') return 'succeeded';
  if (code === 'TIP' || code === 'PENDING' || code === 'IN_PROGRESS') return 'processing';
  if (code === 'TA' || code === 'CANCELLED') return 'cancelled';
  // Tout ce qui n'est ni abouti, ni en cours, ni annulé est un échec : mieux
  // vaut clore un paiement à tort que laisser un payeur en attente indéfinie.
  return 'failed';
}

function readCredentials(): MobileMoneyCredentials | null {
  const env = getServerEnv();
  if (
    !env.AIRTEL_MONEY_BASE_URL ||
    !env.AIRTEL_MONEY_CLIENT_ID ||
    !env.AIRTEL_MONEY_CLIENT_SECRET ||
    !env.AIRTEL_MONEY_CALLBACK_SECRET
  ) {
    return null;
  }
  return {
    baseUrl: env.AIRTEL_MONEY_BASE_URL,
    clientId: env.AIRTEL_MONEY_CLIENT_ID,
    clientSecret: env.AIRTEL_MONEY_CLIENT_SECRET,
    callbackSecret: env.AIRTEL_MONEY_CALLBACK_SECRET,
  };
}

export const airtelMoneyProvider = createMobileMoneyProvider({
  code: 'airtel_money',
  label: 'Airtel Money',
  hint: 'Vous recevrez une demande de confirmation sur votre téléphone.',

  tokenPath: '/auth/oauth2/token',
  collectPath: '/merchant/v1/payments/',
  signatureHeader: 'x-signature',
  timestampHeader: 'x-timestamp',

  readCredentials,

  // Airtel identifie le pays et la devise par en-tête, pas dans le corps.
  extraHeaders: { 'X-Country': 'GA', 'X-Currency': 'XAF' },

  buildCollectBody: (intent, msisdn) => ({
    // `reference` est notre propre référence : c'est elle qui revient dans le
    // rappel et qui permet le rapprochement.
    reference: intent.reference,
    subscriber: { country: 'GA', currency: 'XAF', msisdn },
    transaction: {
      amount: intent.amount,
      country: 'GA',
      currency: 'XAF',
      id: intent.reference,
    },
  }),

  readProviderReference: (payload) => {
    const data = payload.data as Record<string, unknown> | undefined;
    const transaction = data?.transaction as Record<string, unknown> | undefined;
    const id = transaction?.id;
    return typeof id === 'string' ? id : null;
  },

  parseCallback: (payload): ParsedCallback | null => {
    const transaction = (payload.transaction ?? payload) as Record<string, unknown>;
    const reference = transaction.id ?? transaction.reference ?? payload.reference;
    if (typeof reference !== 'string' || reference === '') return null;

    const status = toPaymentStatus(transaction.status ?? transaction.status_code);
    const airtelId = transaction.airtel_money_id ?? transaction.transaction_id;

    return {
      reference,
      status,
      providerReference: typeof airtelId === 'string' ? airtelId : null,
      failureReason:
        status === 'failed' && typeof transaction.message === 'string'
          ? transaction.message
          : null,
      payload,
    };
  },
});
