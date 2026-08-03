import 'server-only';

/**
 * Travailleur d'envoi : draine la file `email_outbox`.
 *
 * Appelé par `/api/notifications/envoi`, elle-même déclenchée par une tâche
 * planifiée (Coolify, GitHub Actions, cron du VPS). Rien ici n'est joignable
 * depuis un navigateur.
 *
 * Deux garde-fous qui comptent :
 *
 *  - **un lot borné par passage** : mieux vaut plusieurs passages courts qu'une
 *    requête HTTP qui dépasse le délai du proxy au milieu d'un envoi ;
 *  - **envois séquentiels** : la plupart des fournisseurs limitent le débit, et
 *    dépasser leur quota fait échouer tout le lot plutôt qu'un seul message.
 */
import { renderNotificationEmail } from '@/lib/email/templates';
import { resendProvider } from '@/lib/email/resend';
import type { EmailProvider } from '@/lib/email/types';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

const PROVIDER: EmailProvider = resendProvider;

/** `true` si l'envoi d'e-mails est utilisable sur cette instance. */
export function emailAvailable(): boolean {
  return PROVIDER.isConfigured();
}

export interface DispatchReport {
  claimed: number;
  sent: number;
  failed: number;
}

/**
 * Expédie un lot d'e-mails en attente.
 *
 * @param limit Taille du lot. Vingt tient largement dans une requête HTTP.
 */
export async function dispatchPendingEmails(limit = 20): Promise<DispatchReport> {
  if (!PROVIDER.isConfigured()) {
    // Ce n'est pas une erreur : sans fournisseur, la file s'accumule sans
    // dommage et les notifications continuent d'arriver dans l'application.
    return { claimed: 0, sent: 0, failed: 0 };
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc('claim_pending_emails', { p_limit: limit });
  if (error) {
    logger.error('Réclamation de la file d’envoi impossible', error);
    throw new Error('File d’envoi inaccessible.');
  }

  const batch = data ?? [];
  let sent = 0;
  let failed = 0;

  for (const row of batch) {
    const { subject, html, text } = renderNotificationEmail(
      row.kind,
      (row.payload ?? {}) as Record<string, unknown>,
      row.full_name,
    );

    const result = await PROVIDER.send({
      to: row.email,
      toName: row.full_name,
      subject,
      html,
      text,
    });

    if (result.ok) {
      sent += 1;
      await admin.rpc('mark_email_sent', { p_id: row.id, p_error: null });
    } else {
      failed += 1;
      // L'envoi repart au tour suivant ; après cinq tentatives, la base cesse
      // de le proposer — à ce stade le problème n'est plus passager.
      await admin.rpc('mark_email_sent', { p_id: row.id, p_error: result.message });
      logger.warn('E-mail non expédié', { id: row.id, kind: row.kind, attempts: row.attempts });
    }
  }

  return { claimed: batch.length, sent, failed };
}
