import 'server-only';

/**
 * Gardes de rôle côté serveur.
 *
 * Ces helpers pilotent l'AFFICHAGE (masquer un lien, rediriger une page). Ils ne
 * sont jamais la source de vérité : l'autorisation réelle est appliquée par
 * PostgreSQL — RLS, privilèges de colonnes, et les RPC `admin_*` qui vérifient
 * elles-mêmes `is_admin()` / `is_staff()`. Contourner une garde d'affichage ne
 * donne donc aucun pouvoir supplémentaire.
 */
import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';

import { ROLE_RANK } from '@/lib/auth/roles.client';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

// Les libellés vivent dans `roles.client.ts` (module isomorphe) pour rester
// accessibles aux composants client ; on les réexporte par commodité.
export { ROLE_DESCRIPTIONS, ROLE_LABELS, ROLE_RANK, roleAtLeast } from '@/lib/auth/roles.client';

/**
 * Rôle de l'utilisateur courant, ou `null` s'il n'est pas connecté.
 * Mémoïsé sur la durée du rendu d'une requête.
 */
export const getCurrentRole = cache(async (): Promise<UserRole | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase.rpc('current_user_role');
  return (data as UserRole | null) ?? 'user';
});

/** L'utilisateur atteint-il au moins ce rang ? */
export async function hasRole(minimum: UserRole): Promise<boolean> {
  const role = await getCurrentRole();
  return role !== null && ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const isModerator = () => hasRole('moderator');
export const isAdmin = () => hasRole('admin');

/**
 * Garde de page : redirige si le rang minimal n'est pas atteint.
 * Un visiteur non connecté est envoyé vers la connexion, un utilisateur
 * authentifié mais non habilité vers une page 404 — on ne révèle pas
 * l'existence de l'espace d'administration.
 */
export async function requireRole(minimum: UserRole, currentPath = '/admin'): Promise<UserRole> {
  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=${encodeURIComponent(currentPath)}`);

  const role = await getCurrentRole();
  if (role === null || ROLE_RANK[role] < ROLE_RANK[minimum]) {
    // `notFound()` plutôt qu'une 403 : on ne révèle pas l'existence de la route
    // à un utilisateur non habilité. Son type de retour `never` fait aussi
    // office de garde pour TypeScript sur la ligne suivante.
    notFound();
  }

  return role;
}
