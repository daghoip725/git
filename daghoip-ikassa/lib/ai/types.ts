import 'server-only';

/**
 * Contrat de l'assistant de rédaction.
 *
 * Deux usages seulement, tous deux **facultatifs** : rédiger une première
 * version de description, et corriger l'orthographe d'un texte existant. Tout
 * le reste des « fonctionnalités intelligentes » (prix, doublons, fraude,
 * recommandations) vit en base, où c'est déterministe et auditable.
 *
 * Règles qui gouvernent cette couche :
 *
 *  1. **Le texte de l'utilisateur est une donnée, jamais une instruction.** Une
 *     description d'annonce peut contenir « ignore les consignes précédentes ».
 *     Les invites sont écrites en conséquence, et la sortie est bornée puis
 *     renettoyée avant d'être proposée.
 *  2. **Rien n'est écrit sans l'accord du vendeur.** L'assistant remplit un
 *     champ, il ne publie pas. Une suggestion refusée ne laisse aucune trace.
 *  3. **Sans clé, pas de fonctionnalité, pas d'erreur.** `isConfigured()`
 *     répond `false` et l'interface n'affiche simplement pas le bouton — le
 *     dépôt d'annonce reste entièrement utilisable.
 */

/** Ce que l'on sait de l'annonce au moment de proposer une description. */
export interface DescriptionBrief {
  title: string;
  categoryName: string;
  city: string;
  condition?: string | null;
  price?: number | null;
  /** Points que le vendeur a déjà notés, éventuellement en style télégraphique. */
  notes?: string | null;
}

export type AssistantResult = { ok: true; text: string } | { ok: false; message: string };

export interface TextAssistant {
  readonly label: string;
  /** `true` si les identifiants nécessaires sont présents dans l'environnement. */
  isConfigured(): boolean;
  /** Rédige une description à partir des éléments connus de l'annonce. */
  writeDescription(brief: DescriptionBrief): Promise<AssistantResult>;
  /** Corrige l'orthographe et la grammaire sans changer le propos. */
  proofread(text: string): Promise<AssistantResult>;
}
