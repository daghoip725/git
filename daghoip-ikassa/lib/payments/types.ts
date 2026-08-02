import 'server-only';

/**
 * Contrat d'un fournisseur d'encaissement.
 *
 * Tout ce que le reste de l'application sait d'Airtel Money ou de Moov Money
 * tient dans cette interface. Ajouter un opérateur consiste à écrire un module
 * qui l'implémente et à l'inscrire au registre — aucune page, aucune action et
 * aucun objet SQL n'a à changer.
 *
 * Deux invariants gouvernent l'ensemble :
 *
 *  1. **Le montant ne vient jamais du client.** L'adaptateur reçoit un paiement
 *     déjà créé en base par `request_subscription()` ou `request_ad_feature()`,
 *     dont le tarif a été relu dans le catalogue. Il ne fait que le présenter à
 *     l'opérateur.
 *  2. **Seul le serveur constate un encaissement.** Le rappel de l'opérateur est
 *     authentifié par `verifyCallback()` puis appliqué par
 *     `apply_payment_callback()`, réservée à la clé `service_role`.
 */
import type { PaymentProvider, PaymentStatus } from '@/types/database';

/** Paiement tel qu'il est transmis à l'adaptateur : lu en base, jamais du client. */
export interface PaymentIntent {
  /** Identifiant interne du paiement (`payments.id`). */
  id: string;
  /** Référence publique `DI-PAY-…`, clé de rapprochement avec l'opérateur. */
  reference: string;
  /** Montant en FCFA, entier : le franc CFA n'a pas de sous-unité. */
  amount: number;
  currency: string;
  /** Numéro du payeur en E.164 (`+241…`), quand il est connu. */
  payerPhone: string | null;
  /** Libellé montré au payeur sur son téléphone. */
  label: string;
}

/** Ce que l'adaptateur répond quand on lui demande d'engager un paiement. */
export type InitiationResult =
  | {
      kind: 'push';
      /** L'opérateur a envoyé une demande de confirmation sur le téléphone. */
      providerReference: string | null;
      message: string;
    }
  | {
      kind: 'redirect';
      /** Le payeur doit être renvoyé vers une page de l'opérateur. */
      url: string;
      providerReference: string | null;
    }
  | {
      kind: 'instructions';
      /** Aucun appel machine : on affiche la marche à suivre au payeur. */
      message: string;
      steps: string[];
    }
  | {
      kind: 'error';
      message: string;
    };

/** Rappel entrant, une fois authentifié et traduit dans le vocabulaire maison. */
export interface ParsedCallback {
  /** Référence `DI-PAY-…` telle que renvoyée par l'opérateur. */
  reference: string;
  status: PaymentStatus;
  providerReference: string | null;
  failureReason: string | null;
  /** Charge utile brute, conservée telle quelle dans le journal. */
  payload: Record<string, unknown>;
}

/** Résultat de l'authentification d'un rappel. */
export interface VerificationResult {
  valid: boolean;
  /** Raison de l'échec, journalisée côté serveur — jamais renvoyée à l'appelant. */
  reason?: string;
}

export interface CallbackRequest {
  /** Corps brut : la signature porte sur les octets reçus, pas sur l'objet relu. */
  rawBody: string;
  headers: Headers;
}

export interface PaymentProviderAdapter {
  /** Valeur de l'énumération `payment_provider` correspondante. */
  readonly code: PaymentProvider;
  /** Nom affiché au payeur. */
  readonly label: string;
  /** Courte phrase expliquant ce qui va se passer, montrée avant paiement. */
  readonly hint: string;
  /**
   * `true` si les identifiants nécessaires sont présents dans l'environnement.
   *
   * Un adaptateur non configuré n'est **pas** proposé au payeur : mieux vaut ne
   * pas afficher un moyen de paiement que d'ouvrir une demande qui échouera.
   */
  isConfigured(): boolean;
  /** Engage le paiement auprès de l'opérateur. */
  initiate(intent: PaymentIntent): Promise<InitiationResult>;
  /** Authentifie un rappel entrant (signature, horodatage, secret partagé). */
  verifyCallback(request: CallbackRequest): Promise<VerificationResult>;
  /** Traduit un rappel authentifié dans le vocabulaire de l'application. */
  parseCallback(rawBody: string): ParsedCallback | null;
}
