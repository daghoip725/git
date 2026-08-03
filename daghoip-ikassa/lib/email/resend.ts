import 'server-only';

/**
 * Envoi d'e-mails via Resend.
 *
 * Appel HTTP direct plutôt que le SDK : une seule requête ne justifie pas une
 * dépendance de plus, et l'on garde la main sur le délai d'attente.
 *
 * ⚠️ **Non éprouvé contre l'API réelle** : ce module a été écrit d'après la
 * forme publique de l'API de Resend, sans compte de test. Avant la première
 * mise en service, envoyez un e-mail réel depuis `/api/notifications/envoi` et
 * vérifiez que le domaine expéditeur est bien vérifié chez le fournisseur —
 * sans quoi les messages partent en indésirables, ou ne partent pas du tout.
 */
import { getServerEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import type { EmailProvider, OutgoingEmail, SendResult } from '@/lib/email/types';

const API_URL = 'https://api.resend.com/emails';
const REQUEST_TIMEOUT_MS = 15_000;

/** Encadre le nom pour un en-tête `To:`, en neutralisant les guillemets. */
function formatRecipient(email: string, name?: string | null): string {
  if (!name) return email;
  const safe = name.replace(/["\\<>\r\n]/g, ' ').trim();
  return safe ? `"${safe}" <${email}>` : email;
}

export const resendProvider: EmailProvider = {
  label: 'Resend',

  isConfigured() {
    const { RESEND_API_KEY, EMAIL_FROM } = getServerEnv();
    // Les deux sont nécessaires : une clé sans expéditeur vérifié ne sert à rien.
    return Boolean(RESEND_API_KEY && EMAIL_FROM);
  },

  async send(email: OutgoingEmail): Promise<SendResult> {
    const { RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO } = getServerEnv();
    if (!RESEND_API_KEY || !EMAIL_FROM) {
      return { ok: false, message: 'Service d’e-mail non configuré.' };
    }

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [formatRecipient(email.to, email.toName)],
          subject: email.subject,
          html: email.html,
          text: email.text,
          ...(EMAIL_REPLY_TO ? { reply_to: EMAIL_REPLY_TO } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });

      if (!response.ok) {
        // Le corps d'erreur peut contenir l'adresse du destinataire : il est
        // journalisé côté serveur, jamais remonté tel quel.
        const detail = await response.text().catch(() => '');
        logger.error('Envoi d’e-mail refusé', new Error(`HTTP ${response.status}`), { detail });
        return { ok: false, message: `Refus du fournisseur (HTTP ${response.status}).` };
      }

      const payload = (await response.json().catch(() => null)) as { id?: string } | null;
      return { ok: true, id: payload?.id };
    } catch (error) {
      logger.error('Envoi d’e-mail impossible', error);
      return { ok: false, message: 'Fournisseur d’e-mail injoignable.' };
    }
  },
};
