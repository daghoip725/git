'use client';

/**
 * Choix de la langue d'interface.
 *
 * Application immédiate, sans bouton « Enregistrer » à chercher : la langue est
 * un réglage qu'on veut voir prendre effet tout de suite, et un formulaire qui
 * demanderait de valider un choix déjà visible serait une étape de trop.
 * `router.refresh()` recharge les Server Components avec la nouvelle langue —
 * la page se retraduit sans rechargement complet.
 */
import { Check, Languages, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { setLanguageAction } from '@/app/actions/settings.actions';
import { Alert } from '@/components/ui/Alert';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/config';
import { cn } from '@/utils/cn';

export interface LanguageFormProps {
  current: Locale;
  labels: { title: string; help: string; saved: string; error: string };
}

export function LanguageForm({ current, labels }: LanguageFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Locale>(current);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function choose(locale: Locale) {
    if (locale === selected) return;

    // Bascule optimiste : la pastille suit le clic, et revient en arrière si le
    // serveur refuse. Attendre l'aller-retour donnerait l'impression d'un
    // bouton mort sur une connexion lente.
    const previous = selected;
    setSelected(locale);
    setError(null);
    setSaved(false);

    startTransition(async () => {
      const result = await setLanguageAction(locale);
      if (!result.success) {
        setSelected(previous);
        setError(result.error ?? labels.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold text-brand-900">
        <Languages className="size-5 text-brand-600" aria-hidden="true" />
        {labels.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-600">{labels.help}</p>

      <ul className="mt-4 space-y-2">
        {LOCALES.map((locale) => {
          const active = locale === selected;
          return (
            <li key={locale}>
              <button
                type="button"
                onClick={() => choose(locale)}
                aria-pressed={active}
                disabled={isPending}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3.5 py-3 text-left text-sm font-semibold transition-colors disabled:opacity-60',
                  active
                    ? 'border-brand-500 bg-brand-50 text-brand-900'
                    : 'border-neutral-300 text-neutral-700 hover:border-brand-300',
                )}
              >
                {/* Chaque langue écrite dans sa propre langue : on ne cherche
                    pas « Anglais » quand on ne lit pas le français. */}
                {LOCALE_LABELS[locale]}
                {active ? <Check className="size-4.5" aria-hidden="true" /> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {isPending ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />…
        </p>
      ) : null}

      {saved && !isPending ? (
        <Alert tone="success" className="mt-3">
          {labels.saved}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      ) : null}
    </section>
  );
}
