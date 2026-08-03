/**
 * Réglages de notification.
 *
 * L'absence de ligne en base vaut « valeurs par défaut » : on ne crée rien à
 * l'inscription, et cette page affiche simplement les valeurs effectives.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import {
  NotificationSettingsForm,
  type NotificationSettingsValues,
} from '@/components/account/NotificationSettingsForm';
import { emailAvailable } from '@/lib/email/dispatcher';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Mes notifications',
  robots: { index: false, follow: false },
};

/** Mêmes valeurs que celles inscrites dans la migration 13. */
const DEFAULTS: NotificationSettingsValues = {
  emailMessages: true,
  emailAdStatus: true,
  emailReviews: false,
  emailPayments: true,
  emailSubscription: true,
  messageDelay: 10,
};

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/notifications');

  const supabase = await createClient();
  const { data } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const values: NotificationSettingsValues = data
    ? {
        emailMessages: data.email_messages,
        emailAdStatus: data.email_ad_status,
        emailReviews: data.email_reviews,
        emailPayments: data.email_payments,
        emailSubscription: data.email_subscription,
        messageDelay: data.message_email_delay_minutes,
      }
    : DEFAULTS;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">Mes notifications</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Choisissez ce dont vous voulez être prévenu par e-mail. Tout reste visible dans la cloche,
          quels que soient ces réglages.
        </p>
      </header>

      <div className="max-w-xl rounded-xl border border-neutral-200 bg-card p-5">
        <NotificationSettingsForm values={values} emailAvailable={emailAvailable()} />
      </div>
    </div>
  );
}
