import 'server-only';

/**
 * Point d'entrée de l'assistant de rédaction.
 *
 * Le reste de l'application ne connaît pas Anthropic : il demande « y a-t-il un
 * assistant ? » et reçoit une implémentation ou `null`. Changer de fournisseur
 * revient à écrire un module conforme à `TextAssistant` et à modifier cette
 * seule ligne.
 */
import { anthropicAssistant } from '@/lib/ai/anthropic';
import type { TextAssistant } from '@/lib/ai/types';

const ASSISTANT: TextAssistant = anthropicAssistant;

/**
 * Assistant utilisable sur cette instance, ou `null` s'il n'est pas configuré.
 *
 * Le dépôt d'annonce fonctionne entièrement sans lui : le nettoyage
 * typographique de `lib/ai/tidy.ts`, lui, ne dépend d'aucune clé et reste
 * toujours disponible.
 */
export function getAssistant(): TextAssistant | null {
  return ASSISTANT.isConfigured() ? ASSISTANT : null;
}

/** `true` si l'interface peut proposer les boutons d'aide à la rédaction. */
export function assistantAvailable(): boolean {
  return ASSISTANT.isConfigured();
}

export type { AssistantResult, DescriptionBrief, TextAssistant } from '@/lib/ai/types';
