/**
 * Paramètres du compte.
 *
 * Regroupe les quatre réglages qui ne relèvent ni du profil public ni des
 * annonces : langue, mot de passe, notifications, suppression. Les deux du
 * milieu ont leur propre page — elles portent des formulaires à part entière —
 * et sont ici renvoyées plutôt que dupliquées.
 *
 * L'ordre n'est pas indifférent : la suppression ferme la page, en dernier,
 * dans un encadré rouge. Personne ne doit tomber dessus en cherchant sa langue.
 */
import { Bell, KeyRound, Settings, ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DeleteAccountForm } from '@/components/account/DeleteAccountForm';
import { LanguageForm } from '@/components/account/LanguageForm';
import { getLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { getCurrentUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Paramètres',
  robots: { index: false, follow: false },
};

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/parametres');

  const locale = await getLocale();
  const t = getDictionary(locale).settings;

  const links = [
    {
      href: '/compte/mot-de-passe',
      icon: KeyRound,
      label: t.passwordLink,
      help: t.passwordLinkHelp,
    },
    {
      href: '/compte/notifications',
      icon: Bell,
      label: t.notificationsLink,
      help: t.notificationsLinkHelp,
    },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold text-brand-900">
          <Settings className="size-6 text-brand-600" aria-hidden="true" />
          {t.title}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">{t.subtitle}</p>
      </header>

      <LanguageForm
        current={locale}
        labels={{
          title: t.languageTitle,
          help: t.languageHelp,
          saved: t.languageSaved,
          error: t.languageError,
        }}
      />

      <section className="rounded-xl border border-neutral-200 bg-card p-4">
        <h2 className="font-bold text-brand-900">{t.securityTitle}</h2>
        <ul className="mt-3 space-y-2">
          {links.map(({ href, icon: Icon, label, help }) => (
            <li key={href}>
              <Link
                href={href}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3.5 py-3 transition-colors hover:border-brand-300"
              >
                <Icon className="size-5 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-neutral-800">{label}</span>
                  <span className="block text-xs text-neutral-500">{help}</span>
                </span>
                <ChevronRight className="size-4.5 shrink-0 text-neutral-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <DeleteAccountForm
        labels={{
          title: t.dangerTitle,
          lead: t.dangerLead,
          removed: t.dangerRemoved,
          kept: t.dangerKept,
          confirmLabel: t.dangerConfirmLabel,
          submit: t.dangerSubmit,
          cancel: t.dangerCancel,
        }}
      />
    </div>
  );
}
