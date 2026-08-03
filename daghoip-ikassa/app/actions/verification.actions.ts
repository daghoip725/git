'use server';

/**
 * Demande de badge « vendeur vérifié ».
 *
 * Les pièces justificatives (CNI, RCCM) sont téléversées depuis le navigateur
 * vers le bucket **privé** `verification-docs`, dans le dossier de l'utilisateur.
 * Cette action ne reçoit que les chemins ; la RPC `request_verification()`
 * revérifie qu'ils pointent bien vers le dossier de l'appelant, et la politique
 * Storage empêche de toute façon d'écrire ailleurs.
 */
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { fail, ok } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { RATE_LIMITS, checkRateLimit } from '@/lib/rate-limit';
import { createClient, requireUser } from '@/lib/supabase/server';
import type { ActionResult } from '@/types';
import { gabonPhoneSchema, toFieldErrors } from '@/utils/validation';

/** Chemin `<user_id>/<uuid>.<ext>` dans le bucket des justificatifs. */
const documentPathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(
    /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|pdf)$/i,
    'Document invalide (JPEG, PNG ou PDF).',
  );

const verificationSchema = z.object({
  fullLegalName: z
    .string()
    .trim()
    .min(2, 'Indiquez votre nom tel qu’il figure sur votre pièce d’identité.')
    .max(120),
  contactPhone: gabonPhoneSchema,
  businessName: z.string().trim().max(120).nullable(),
  businessIdNumber: z.string().trim().max(60).nullable(),
  idDocumentPath: documentPathSchema,
  businessDocumentPath: documentPathSchema.nullable(),
});

export async function requestVerificationAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();

    const rate = checkRateLimit(
      `verification:${user.id}`,
      RATE_LIMITS.verification.limit,
      RATE_LIMITS.verification.windowMs,
    );
    if (!rate.success) {
      return { success: false, error: 'Trop de demandes envoyées. Réessayez demain.' };
    }

    const nullable = (key: string) => {
      const value = formData.get(key);
      return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
    };

    const parsed = verificationSchema.safeParse({
      fullLegalName: formData.get('fullLegalName'),
      contactPhone: formData.get('contactPhone') ?? '',
      businessName: nullable('businessName'),
      businessIdNumber: nullable('businessIdNumber'),
      idDocumentPath: formData.get('idDocumentPath'),
      businessDocumentPath: nullable('businessDocumentPath'),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: 'Veuillez corriger les champs signalés.',
        fieldErrors: toFieldErrors(parsed.error),
      };
    }

    // Défense en profondeur : la RPC refait ce contrôle côté PostgreSQL.
    const ownsPath = (path: string | null) => !path || path.startsWith(`${user.id}/`);
    if (!ownsPath(parsed.data.idDocumentPath) || !ownsPath(parsed.data.businessDocumentPath)) {
      return { success: false, error: 'Document invalide.' };
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc('request_verification', {
      p_full_legal_name: parsed.data.fullLegalName,
      p_contact_phone: parsed.data.contactPhone ?? '',
      p_id_document_path: parsed.data.idDocumentPath,
      p_business_name: parsed.data.businessName,
      p_business_id_number: parsed.data.businessIdNumber,
      p_business_document_path: parsed.data.businessDocumentPath,
    });

    if (error) {
      // 23505 : une demande est déjà en cours d'instruction.
      if (error.code === '23505') {
        return { success: false, error: 'Une demande est déjà en cours d’instruction.' };
      }
      if (error.code === 'P0001') return { success: false, error: error.message };
      logger.error('Demande de vérification impossible', error, { userId: user.id });
      return fail(error, 'Impossible d’enregistrer votre demande.');
    }

    revalidatePath('/compte/verification');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}

/** Annule une demande encore en attente. */
export async function cancelVerificationAction(requestId: string): Promise<ActionResult<null>> {
  try {
    await requireUser();

    const parsed = z.string().uuid().safeParse(requestId);
    if (!parsed.success) return { success: false, error: 'Demande introuvable.' };

    const supabase = await createClient();
    // La RLS limite déjà l'UPDATE au demandeur et aux demandes « pending ».
    const { error } = await supabase
      .from('verification_requests')
      .update({ status: 'cancelled' })
      .eq('id', parsed.data);

    if (error) return fail(error, 'Impossible d’annuler la demande.');

    revalidatePath('/compte/verification');
    return ok(null);
  } catch (error) {
    return fail(error);
  }
}
