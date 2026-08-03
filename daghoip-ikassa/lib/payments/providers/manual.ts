import 'server-only';

/**
 * Encaissement hors ligne : virement bancaire, espèces, ou dépôt Mobile Money
 * fait à la main sur le compte de la plateforme.
 *
 * Ce fournisseur est **toujours disponible** : il ne dépend d'aucun contrat
 * opérateur. C'est ce qui permet à la plateforme d'encaisser dès le premier
 * jour, avant qu'Airtel ou Moov n'aient ouvert un accès à leur API.
 *
 * Il n'a évidemment pas de rappel automatique : le paiement reste en attente
 * jusqu'à ce qu'un administrateur le confirme depuis `/admin/paiements`, après
 * avoir constaté l'arrivée des fonds. C'est lent et manuel — et c'est
 * volontairement dit tel quel au payeur.
 */
import { formatPrice } from '@/utils/format';

import type {
  CallbackRequest,
  InitiationResult,
  ParsedCallback,
  PaymentIntent,
  PaymentProviderAdapter,
  VerificationResult,
} from '@/lib/payments/types';

export const manualProvider: PaymentProviderAdapter = {
  code: 'bank_transfer',
  label: 'Virement ou dépôt',
  hint: 'Confirmation par un administrateur après réception des fonds (sous 24 h ouvrées).',

  isConfigured() {
    return true;
  },

  async initiate(intent: PaymentIntent): Promise<InitiationResult> {
    return {
      kind: 'instructions',
      message:
        `Votre demande de paiement de ${formatPrice(intent.amount) ?? `${intent.amount} FCFA`} ` +
        'est enregistrée. Elle sera validée dès réception des fonds.',
      steps: [
        `Effectuez le dépôt en indiquant la référence ${intent.reference}.`,
        'Conservez le reçu de l’opération : il fait foi en cas de litige.',
        'Un administrateur confirme le paiement sous 24 h ouvrées.',
        'Vous recevez une notification et votre facture dès la confirmation.',
      ],
    };
  },

  async verifyCallback(_request: CallbackRequest): Promise<VerificationResult> {
    // Aucun opérateur ne rappelle pour ce mode : tout rappel prétendant le
    // contraire est illégitime.
    return { valid: false, reason: 'Ce moyen de paiement n’émet pas de rappel automatique.' };
  },

  parseCallback(): ParsedCallback | null {
    return null;
  },
};
