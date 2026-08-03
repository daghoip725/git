/**
 * Déclenchement de l'envoi des e-mails en attente.
 *
 * Route publique par nécessité — elle est appelée par un planificateur externe
 * (Coolify, GitHub Actions, cron du VPS) qui n'a pas de session. Elle est donc
 * protégée par un **secret partagé** comparé à temps constant : sans lui,
 * n'importe qui pourrait la déclencher en boucle et épuiser le quota du
 * fournisseur d'e-mails.
 *
 * Exemple d'appel :
 *
 *   curl -X POST https://votre-domaine.ga/api/notifications/envoi \
 *        -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET"
 *
 * Une cadence de cinq minutes convient : le délai de grâce d'un e-mail de
 * message est de dix minutes par défaut, la latence ajoutée reste invisible.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

import { dispatchPendingEmails, emailAvailable } from '@/lib/email/dispatcher';
import { getServerEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/** Comparaison à temps constant : un `===` laisserait deviner le secret. */
function secretMatches(received: string, expected: string): boolean {
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorize(request: Request): boolean {
  const { NOTIFICATIONS_CRON_SECRET } = getServerEnv();
  if (!NOTIFICATIONS_CRON_SECRET) return false;

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token !== '' && secretMatches(token, NOTIFICATIONS_CRON_SECRET);
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!authorize(request)) {
    // 404 et non 401 : à un appelant non autorisé, l'existence même de cette
    // route n'apprend rien d'utile.
    return NextResponse.json({ error: 'Introuvable.' }, { status: 404 });
  }

  if (!emailAvailable()) {
    // 200 : l'appel est légitime, il n'y a simplement rien à faire. Répondre en
    // erreur ferait sonner l'alerte d'un planificateur pour une configuration
    // volontaire.
    return NextResponse.json(
      { skipped: true, reason: 'Aucun fournisseur d’e-mail configuré.' },
      { status: 200 },
    );
  }

  try {
    const report = await dispatchPendingEmails(20);
    logger.info('File d’envoi traitée', { ...report });
    return NextResponse.json(report, { status: 200 });
  } catch (error) {
    logger.error('Traitement de la file d’envoi impossible', error);
    return NextResponse.json({ error: 'Traitement impossible.' }, { status: 500 });
  }
}
