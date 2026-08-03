import 'server-only';

/**
 * Demandes de badge « vendeur vérifié ».
 *
 * Les pièces justificatives vivent dans un bucket **privé** : elles ne sont
 * jamais servies par une URL publique. Le modérateur y accède par une URL
 * signée de courte durée, générée à la volée et soumise à la politique Storage
 * (`verification_docs_read` : le propriétaire ou le staff).
 */
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import type { Tables } from '@/types/database';
import { VERIFICATION_DOCS_BUCKET } from '@/utils/constants';

export type VerificationRequest = Tables<'verification_requests'>;

export interface VerificationRequestWithUser extends VerificationRequest {
  user: {
    id: string;
    full_name: string;
    city: string | null;
    is_verified: boolean;
    ads_count: number;
    created_at: string;
  } | null;
}

const REQUEST_COLUMNS = `
  id, user_id, full_legal_name, business_name, business_id_number, contact_phone,
  id_document_path, business_document_path, status, reviewed_by, reviewed_at,
  rejection_reason, created_at, updated_at,
  user:users!verification_requests_user_id_fkey(
    id, full_name, city, is_verified, ads_count, created_at
  )
`;

/** Demandes de l'utilisateur courant, plus récente d'abord. */
export async function getMyVerificationRequests(userId: string): Promise<VerificationRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('verification_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<VerificationRequest[]>();

  if (error) {
    logger.error('Chargement des demandes de vérification impossible', error, { userId });
    return [];
  }
  return data ?? [];
}

/** File d'instruction (staff). La RLS filtre les non-habilités. */
export async function getVerificationQueue(
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' = 'pending',
  limit = 50,
): Promise<VerificationRequestWithUser[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('verification_requests')
    .select(REQUEST_COLUMNS)
    .eq('status', status)
    .order('created_at', { ascending: status === 'pending' })
    .limit(limit)
    .returns<VerificationRequestWithUser[]>();

  if (error) {
    logger.error('Chargement de la file de vérification impossible', error);
    return [];
  }
  return data ?? [];
}

/**
 * URL signée d'une pièce justificative, valable 5 minutes.
 * Retourne `null` si l'appelant n'y a pas droit (la politique Storage tranche).
 */
export async function getDocumentSignedUrl(storagePath: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(VERIFICATION_DOCS_BUCKET)
    .createSignedUrl(storagePath, 300);

  if (error) {
    logger.warn('URL signée indisponible', { path: storagePath });
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Nombre de demandes en attente, pour le badge de la navigation admin. */
export async function countPendingVerifications(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('verification_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return count ?? 0;
}
