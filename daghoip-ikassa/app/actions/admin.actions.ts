'use server';

/**
 * Actions d'administration : rôles, statut de compte, vérification vendeur,
 * modération des signalements.
 *
 * Toutes délèguent à des RPC PostgreSQL `SECURITY DEFINER` qui **revérifient
 * l'autorisation** (`is_admin()`, `is_staff()`) et journalisent l'action dans
 * `auth_audit_log`. Les gardes de rôle côté Next.js ne servent qu'à
 * l'affichage : les contourner ne donne aucun pouvoir, la base refuse.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';

const uuidSchema = z.string().uuid();

/**
 * Remonte tel quel le message des exceptions métier PostgreSQL.
 *
 * Les RPC d'administration lèvent des messages rédigés pour être lus par un
 * modérateur (« Impossible de retirer le dernier administrateur. ») : les
 * masquer derrière un message générique rendrait l'interface inutilisable.
 * Ces codes ne divulguent aucune structure interne.
 *  - P0001 : règle métier
 *  - 42501 : autorisation refusée
 */
function toAdminError(error: { code?: string; message?: string } | null): string {
  if (error?.code === 'P0001' || error?.code === '42501') {
    return error.message ?? 'Action refusée.';
  }
  return 'Action impossible. Veuillez réessayer.';
}

/* -------------------------------------------------------------------------- */
/*  Rôles                                                                     */
/* -------------------------------------------------------------------------- */

export async function setUserRoleAction(
  userId: string,
  role: 'user' | 'moderator' | 'admin',
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = z
      .object({ userId: uuidSchema, role: z.enum(['user', 'moderator', 'admin']) })
      .safeParse({ userId, role });
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_set_user_role', {
      p_user_id: parsed.data.userId,
      p_role: parsed.data.role,
    });

    if (error) {
      logger.warn('Changement de rôle refusé', { code: error.code });
      return { success: false, error: toAdminError(error) };
    }

    revalidatePath('/admin/utilisateurs');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Statut de compte                                                          */
/* -------------------------------------------------------------------------- */

export async function setUserStatusAction(
  userId: string,
  status: 'active' | 'suspended' | 'banned',
  reason?: string,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = z
      .object({
        userId: uuidSchema,
        status: z.enum(['active', 'suspended', 'banned']),
        reason: z.string().trim().max(500).optional(),
      })
      .safeParse({ userId, status, reason });
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_set_user_status', {
      p_user_id: parsed.data.userId,
      p_status: parsed.data.status,
      p_reason: parsed.data.reason ?? null,
    });

    if (error) {
      logger.warn('Changement de statut refusé', { code: error.code });
      return { success: false, error: toAdminError(error) };
    }

    revalidatePath('/admin/utilisateurs');
    revalidatePath('/annonces');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Vérification vendeur                                                      */
/* -------------------------------------------------------------------------- */

export async function reviewVerificationAction(
  requestId: string,
  approve: boolean,
  reason?: string,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = z
      .object({
        requestId: uuidSchema,
        approve: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .safeParse({ requestId, approve, reason });
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    // Un refus doit être motivé : c'est ce que lira le vendeur.
    if (!parsed.data.approve && !parsed.data.reason) {
      return { success: false, error: 'Veuillez indiquer le motif du refus.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc('review_verification', {
      p_request_id: parsed.data.requestId,
      p_approve: parsed.data.approve,
      p_reason: parsed.data.reason ?? null,
    });

    if (error) {
      logger.warn('Instruction de vérification refusée', { code: error.code });
      return { success: false, error: toAdminError(error) };
    }

    revalidatePath('/admin/verifications');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Retire le badge « vérifié » d'un compte (staff). */
export async function revokeVerificationAction(
  userId: string,
  reason?: string,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = uuidSchema.safeParse(userId);
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    const { error } = await supabase.rpc('admin_revoke_verification', {
      p_user_id: parsed.data,
      p_reason: reason ?? null,
    });

    if (error) return { success: false, error: toAdminError(error) };

    revalidatePath('/admin/utilisateurs');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Signalements                                                              */
/* -------------------------------------------------------------------------- */

export async function resolveReportAction(
  reportId: string,
  status: 'reviewing' | 'resolved' | 'dismissed',
  note?: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const parsed = z
      .object({
        reportId: uuidSchema,
        status: z.enum(['reviewing', 'resolved', 'dismissed']),
        note: z.string().trim().max(1000).optional(),
      })
      .safeParse({ reportId, status, note });
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    // La RLS `reports_update_staff` tranche : un non-staff n'affecte aucune ligne.
    const { error } = await supabase
      .from('reports')
      .update({
        status: parsed.data.status,
        resolved_by: user.id,
        resolved_at: parsed.data.status === 'reviewing' ? null : new Date().toISOString(),
        resolution_note: parsed.data.note ?? null,
      })
      .eq('id', parsed.data.reportId);

    if (error) {
      logger.warn('Traitement du signalement refusé', { code: error.code });
      return { success: false, error: toAdminError(error) };
    }

    revalidatePath('/admin/signalements');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Retire une annonce de la vitrine depuis la file de modération. */
export async function moderateAdAction(
  adId: string,
  action: 'archive' | 'reject' | 'restore',
  reason?: string,
): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = z
      .object({
        adId: uuidSchema,
        action: z.enum(['archive', 'reject', 'restore']),
        reason: z.string().trim().max(500).optional(),
      })
      .safeParse({ adId, action, reason });
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    // RPC et non UPDATE direct : `rejection_reason` est hors du GRANT UPDATE
    // accordé aux utilisateurs, pour qu'un vendeur ne rédige pas lui-même le
    // motif de refus de son annonce.
    const { error } = await supabase.rpc('admin_moderate_ad', {
      p_ad_id: parsed.data.adId,
      p_action: parsed.data.action,
      p_reason: parsed.data.reason ?? null,
    });

    if (error) {
      logger.warn('Modération d’annonce refusée', { code: error.code });
      return { success: false, error: toAdminError(error) };
    }

    revalidatePath('/admin/signalements');
    revalidatePath('/annonces');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/* -------------------------------------------------------------------------- */
/*  Paiements                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Confirme à la main un règlement hors ligne (virement, espèces, dépôt).
 *
 * Ces règlements n'émettent aucun rappel d'opérateur : sans cette confirmation,
 * la plateforme ne pourrait encaisser qu'après avoir signé un contrat Mobile
 * Money. `admin_confirm_payment()` revérifie `is_admin()` — un modérateur est
 * refusé — et trace l'auteur dans `payment_events`.
 */
export async function confirmPaymentAction(
  paymentId: string,
  note?: string,
): Promise<ActionResult<{ invoiceNumber: string }>> {
  try {
    await requireUser();

    const parsed = z
      .object({ paymentId: uuidSchema, note: z.string().max(300).optional() })
      .safeParse({ paymentId, note: note?.trim() || undefined });
    if (!parsed.success) return { success: false, error: 'Requête invalide.' };

    const supabase = await createClient();
    const { data, error } = await supabase.rpc('admin_confirm_payment', {
      p_payment_id: parsed.data.paymentId,
      p_note: parsed.data.note ?? null,
    });

    if (error) {
      logger.warn('Confirmation de paiement refusée', { code: error.code });
      return { success: false, error: toAdminError(error) };
    }

    revalidatePath('/admin/paiements');
    revalidatePath('/compte/paiements');
    return ok({ invoiceNumber: data ?? '' });
  } catch (error) {
    return fail(error);
  }
}
