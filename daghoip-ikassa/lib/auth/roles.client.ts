/**
 * Libellés et hiérarchie des rôles — module **isomorphe**.
 *
 * Volontairement séparé de `lib/auth/roles.ts`, qui est `server-only` : les
 * composants client (tableau d'administration) ont besoin des libellés sans
 * pouvoir importer les gardes serveur.
 */
import type { UserRole } from '@/types';

/** Hiérarchie : un rang supérieur couvre les rangs inférieurs. */
export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'Utilisateur',
  moderator: 'Modérateur',
  admin: 'Administrateur',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  user: 'Publie des annonces, échange par messagerie, laisse des avis.',
  moderator:
    'Traite les signalements, instruit les demandes de vérification, suspend un compte abusif.',
  admin: 'Tous les droits de modération, plus la gestion des rôles et des catégories.',
};

/** Compare deux rôles sans appel réseau (usage client). */
export function roleAtLeast(role: UserRole | null, minimum: UserRole): boolean {
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum];
}
