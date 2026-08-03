import 'server-only';

/**
 * Registre des moyens de paiement.
 *
 * Point d'entrée unique : le reste de l'application ne connaît jamais un
 * opérateur par son nom, seulement par son code. Brancher un troisième
 * opérateur se réduit à écrire un adaptateur et à l'ajouter au tableau
 * ci-dessous.
 */
import { airtelMoneyProvider } from '@/lib/payments/providers/airtel';
import { manualProvider } from '@/lib/payments/providers/manual';
import { moovMoneyProvider } from '@/lib/payments/providers/moov';
import type { PaymentProviderAdapter } from '@/lib/payments/types';
import type { PaymentProvider } from '@/types/database';

/** Ordre d'affichage : Mobile Money d'abord, c'est l'usage au Gabon. */
const ADAPTERS: readonly PaymentProviderAdapter[] = [
  airtelMoneyProvider,
  moovMoneyProvider,
  manualProvider,
];

/** Adaptateur correspondant à un code, ou `null` si le code est inconnu. */
export function getProvider(code: string): PaymentProviderAdapter | null {
  return ADAPTERS.find((adapter) => adapter.code === code) ?? null;
}

/** Description d'un moyen de paiement, sérialisable vers un composant client. */
export interface ProviderOption {
  code: PaymentProvider;
  label: string;
  hint: string;
  /** `true` si l'opérateur demande le numéro à débiter. */
  requiresPhone: boolean;
}

/**
 * Moyens de paiement réellement utilisables sur cette instance.
 *
 * Un opérateur dont les identifiants manquent est **absent de la liste** :
 * proposer un bouton qui échouera systématiquement coûte plus cher en confiance
 * que de ne pas le montrer.
 */
export function listAvailableProviders(): ProviderOption[] {
  return ADAPTERS.filter((adapter) => adapter.isConfigured()).map((adapter) => ({
    code: adapter.code,
    label: adapter.label,
    hint: adapter.hint,
    requiresPhone: adapter.code === 'airtel_money' || adapter.code === 'moov_money',
  }));
}

/** Codes acceptés en entrée d'une action serveur. */
export function isAvailableProvider(code: string): code is PaymentProvider {
  const adapter = getProvider(code);
  return adapter !== null && adapter.isConfigured();
}
