/**
 * Normalisation des erreurs et messages utilisateurs.
 *
 * Objectif sécurité : ne jamais renvoyer au navigateur un message brut de
 * PostgreSQL ou de Supabase (il peut divulguer noms de tables, contraintes ou
 * détails d'implémentation). On journalise le détail côté serveur et on renvoie
 * un message générique et actionnable en français.
 */
import type { ActionResult } from '@/types';

/** Erreur métier dont le message est sûr à afficher tel quel. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string = 'APP_ERROR',
    readonly status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const AUTH_REQUIRED_MESSAGE = 'Vous devez être connecté pour effectuer cette action.';

/** Traduction des codes d'erreur Supabase Auth les plus fréquents. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Adresse e-mail ou mot de passe incorrect.',
  email_not_confirmed: 'Veuillez confirmer votre adresse e-mail avant de vous connecter.',
  user_already_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  email_exists: 'Un compte existe déjà avec cette adresse e-mail.',
  weak_password: 'Mot de passe trop faible. Choisissez-en un plus robuste.',
  over_request_rate_limit: 'Trop de tentatives. Merci de réessayer dans quelques minutes.',
  over_email_send_rate_limit: 'Trop d’e-mails envoyés. Réessayez dans quelques minutes.',
  same_password: 'Le nouveau mot de passe doit être différent de l’ancien.',
  session_expired: 'Votre session a expiré, veuillez vous reconnecter.',
};

/** Traduction des codes PostgreSQL utiles. */
const POSTGRES_ERROR_MESSAGES: Record<string, string> = {
  '23505': 'Cet élément existe déjà.',
  '23503': 'Référence invalide : l’élément lié n’existe pas.',
  '23514': 'Les données fournies ne respectent pas les règles de validation.',
  '42501': 'Vous n’avez pas les droits nécessaires pour cette opération.',
  P0001: 'Opération refusée par les règles de la plateforme.',
};

interface SupabaseLikeError {
  message?: string;
  code?: string;
  status?: number;
}

function isSupabaseLikeError(value: unknown): value is SupabaseLikeError {
  return typeof value === 'object' && value !== null && ('message' in value || 'code' in value);
}

/**
 * Convertit n'importe quelle erreur en message utilisateur sûr.
 * Le détail complet est journalisé côté serveur.
 */
export function toUserMessage(
  error: unknown,
  fallback = 'Une erreur est survenue. Veuillez réessayer.',
): string {
  if (error instanceof AppError) return error.message;

  if (error instanceof Error && error.message === 'AUTH_REQUIRED') {
    return AUTH_REQUIRED_MESSAGE;
  }

  if (isSupabaseLikeError(error)) {
    const code = error.code ?? '';
    if (code in AUTH_ERROR_MESSAGES) return AUTH_ERROR_MESSAGES[code]!;
    if (code in POSTGRES_ERROR_MESSAGES) return POSTGRES_ERROR_MESSAGES[code]!;
  }

  return fallback;
}

/** Raccourci pour construire un `ActionResult` en échec. */
export function fail(error: unknown, fallback?: string): ActionResult<never> {
  return { success: false, error: toUserMessage(error, fallback) };
}

/** Raccourci pour construire un `ActionResult` en succès. */
export function ok<T>(data: T): ActionResult<T> {
  return { success: true, data };
}
