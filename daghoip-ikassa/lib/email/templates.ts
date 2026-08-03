import 'server-only';

/**
 * Composition des e-mails de notification.
 *
 * Trois contraintes propres au courriel, qui expliquent la forme du code :
 *
 *  1. **Styles en ligne uniquement.** Gmail retire les `<style>` externes, et
 *     la plupart des clients ignorent les feuilles liées. Chaque attribut de
 *     présentation est donc écrit sur l'élément.
 *  2. **Tableaux plutôt que flexbox.** Outlook rend le HTML avec le moteur de
 *     Word : `flex` et `grid` n'y existent pas.
 *  3. **Une version texte, toujours.** Certains clients ne rendent que celle-là,
 *     et un e-mail sans partie texte est bien plus souvent classé indésirable.
 *
 * Le contenu vient de la base et peut inclure du texte rédigé par un
 * utilisateur (titre d'annonce, extrait de message) : tout est échappé.
 */
import { getSiteUrl } from '@/lib/env';
import type { NotificationType } from '@/types/database';
import { BRAND_COLORS, SITE } from '@/utils/constants';

/** Échappement HTML. Le titre d'une annonce est du texte, jamais du balisage. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * N'accepte qu'un chemin interne, et le transforme en URL absolue.
 *
 * Un lien vient de la colonne `notifications.link`, alimentée par des triggers.
 * La contrainte SQL impose déjà un chemin commençant par `/`, mais un e-mail
 * part hors de notre contrôle : mieux vaut refuser deux fois qu'expédier un
 * lien vers un domaine tiers sous notre nom.
 */
function absoluteUrl(link: unknown): string {
  const siteUrl = getSiteUrl();
  if (typeof link !== 'string' || !link.startsWith('/') || link.startsWith('//')) {
    return siteUrl;
  }
  return `${siteUrl}${link}`;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/** Ce que chaque type de notification met dans son e-mail. */
interface Copy {
  subject: (payload: Record<string, unknown>, title: string) => string;
  /** Libellé du bouton d'action. */
  cta: string;
  /** Phrase de contexte, sous le titre. */
  intro?: string;
}

const COPY: Partial<Record<NotificationType, Copy>> = {
  new_message: {
    subject: () => 'Vous avez un nouveau message',
    cta: 'Répondre',
    intro: 'Répondez vite : les acheteurs contactent souvent plusieurs vendeurs.',
  },
  ad_approved: {
    subject: () => 'Votre annonce est approuvée',
    cta: 'Voir mon annonce',
    intro: 'Elle est désormais visible par les acheteurs partout au Gabon.',
  },
  ad_published: {
    subject: () => 'Votre annonce est en ligne',
    cta: 'Voir mon annonce',
  },
  ad_rejected: {
    subject: () => 'Votre annonce a été retirée',
    cta: 'Voir le détail',
    intro: 'Vous pouvez la corriger et la republier.',
  },
  ad_expiring: {
    subject: () => 'Votre annonce expire bientôt',
    cta: 'Prolonger mon annonce',
    intro: 'Sans action de votre part, elle sortira des résultats de recherche.',
  },
  ad_expired: {
    subject: () => 'Votre annonce a expiré',
    cta: 'Remettre en ligne',
  },
  ad_sold: {
    subject: () => 'Annonce marquée comme vendue',
    cta: 'Voir mes annonces',
  },
  new_review: {
    subject: () => 'Vous avez reçu un avis',
    cta: 'Lire l’avis',
  },
  payment_succeeded: {
    subject: () => 'Votre paiement est confirmé',
    cta: 'Voir ma facture',
  },
  payment_failed: {
    subject: () => 'Votre paiement n’a pas abouti',
    cta: 'Reprendre le paiement',
  },
  subscription_expiring: {
    subject: () => 'Votre abonnement expire bientôt',
    cta: 'Renouveler',
    intro: 'Passé cette date, vos quotas reviendront à ceux de l’offre gratuite.',
  },
  system: {
    subject: (_payload, title) => title,
    cta: 'Ouvrir Daghoip Ikassa',
  },
};

const FALLBACK: Copy = { subject: (_payload, title) => title, cta: 'Ouvrir Daghoip Ikassa' };

/**
 * Compose l'e-mail correspondant à une entrée de la file d'envoi.
 *
 * @param kind    Type de notification.
 * @param payload Charge utile rangée par `create_notification()`.
 * @param name    Prénom ou nom complet du destinataire.
 */
export function renderNotificationEmail(
  kind: NotificationType,
  payload: Record<string, unknown>,
  name: string | null,
): EmailContent {
  const copy = COPY[kind] ?? FALLBACK;

  const title = typeof payload.title === 'string' ? payload.title : 'Notification';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const url = absoluteUrl(payload.link);
  const siteUrl = getSiteUrl();
  const greeting = name ? `Bonjour ${name.split(' ')[0]},` : 'Bonjour,';

  const subject = `${copy.subject(payload, title)} — ${SITE.name}`;

  const text = [
    greeting,
    '',
    title,
    body,
    copy.intro ?? '',
    '',
    `${copy.cta} : ${url}`,
    '',
    '—',
    `${SITE.name} — ${SITE.tagline}`,
    `Gérer mes notifications : ${siteUrl}/compte/notifications`,
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#262626;">
  <!-- Aperçu affiché dans la liste des messages, avant ouverture. -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(body || title)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">

          <tr>
            <td style="background-color:${BRAND_COLORS.primary};padding:20px 24px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(SITE.name)}</span>
              <span style="color:${BRAND_COLORS.gold};font-size:13px;display:block;margin-top:2px;">${escapeHtml(SITE.tagline)}</span>
            </td>
          </tr>

          <tr>
            <td style="padding:28px 24px 8px;">
              <p style="margin:0 0 16px;font-size:15px;color:#525252;">${escapeHtml(greeting)}</p>
              <h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:${BRAND_COLORS.primary};">${escapeHtml(title)}</h1>
              ${body ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#404040;">${escapeHtml(body)}</p>` : ''}
              ${copy.intro ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#737373;">${escapeHtml(copy.intro)}</p>` : ''}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px 28px;">
              <!-- Bouton en tableau : Outlook ignore le remplissage d'un <a>. -->
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color:${BRAND_COLORS.primary};border-radius:8px;">
                    <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(copy.cta)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:12px;color:#a3a3a3;word-break:break-all;">${escapeHtml(url)}</p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#fafafa;border-top:1px solid #e5e5e5;padding:16px 24px;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#737373;">
                Vous recevez cet e-mail parce que vous avez un compte sur ${escapeHtml(SITE.name)}.
                <a href="${escapeHtml(siteUrl)}/compte/notifications" style="color:${BRAND_COLORS.secondary};">Gérer mes notifications</a>
              </p>
              <p style="margin:0;font-size:12px;color:#a3a3a3;">
                Ne payez jamais avant d’avoir vu l’article.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}
