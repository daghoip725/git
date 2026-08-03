'use client';

/**
 * Suppression du compte.
 *
 * Trois précautions, et aucune n'est décorative :
 *
 *  1. **Dire ce qui part et ce qui reste, avant de demander quoi que ce soit.**
 *     Quelqu'un qui supprime son compte croit souvent que ses messages
 *     disparaissent des conversations de ses acheteurs. Ils n'y disparaissent
 *     pas — et il vaut mieux qu'il l'apprenne ici que le découvre après.
 *  2. **Recopier un mot.** Une case à cocher se coche par réflexe ; recopier
 *     « SUPPRIMER » oblige à lire.
 *  3. **Ouvrir sur un bouton neutre**, la zone dangereuse restant repliée. Le
 *     bouton rouge ne doit pas se trouver sous le curseur de quelqu'un venu
 *     régler sa langue.
 */
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { deleteAccountAction } from '@/app/actions/settings.actions';
import { DELETE_CONFIRMATION, type DeletionSummary } from '@/lib/account/deletion';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';

export interface DeleteAccountFormProps {
  labels: {
    title: string;
    lead: string;
    removed: string;
    kept: string;
    confirmLabel: string;
    submit: string;
    cancel: string;
  };
}

const REMOVED = [
  'Votre nom, votre photo, votre téléphone et votre adresse.',
  'Vos annonces, retirées du site, et toutes leurs photos.',
  'Vos favoris, votre historique et vos notifications.',
  'Vos pièces d’identité, si vous aviez demandé la vérification.',
];

const KEPT = [
  'Les messages que vous avez envoyés : ils appartiennent aussi à la conversation de votre correspondant, qui garderait sinon un fil à sens unique.',
  'Les avis que vous avez déposés : les effacer changerait la note d’autres vendeurs sans qu’ils y soient pour rien.',
  'Vos règlements : une pièce comptable ne s’efface pas à la demande.',
];

export function DeleteAccountForm({ labels }: DeleteAccountFormProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<
    ActionResult<DeletionSummary> | null,
    FormData
  >(deleteAccountAction, null);

  // Le compte n'existe plus : rester sur une page de l'espace personnel
  // n'aurait aucun sens, et la session vient d'être fermée.
  useEffect(() => {
    if (state?.success) router.replace('/?compte=supprime');
  }, [router, state]);

  const fieldError = state?.success === false ? state.fieldErrors?.confirmation?.[0] : undefined;

  return (
    <section className="rounded-xl border border-red-200 bg-card p-4">
      <h2 className="flex items-center gap-2 font-bold text-red-700">
        <AlertTriangle className="size-5" aria-hidden="true" />
        {labels.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-700">{labels.lead}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-bold tracking-wide text-neutral-500 uppercase">
            {labels.removed}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
            {REMOVED.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="text-xs font-bold tracking-wide text-neutral-500 uppercase">
            {labels.kept}
          </h3>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
            {KEPT.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {open ? (
        <form action={formAction} className="mt-5 max-w-sm space-y-3">
          <Input
            name="confirmation"
            label={`${labels.confirmLabel} « ${DELETE_CONFIRMATION} »`}
            autoComplete="off"
            required
            error={fieldError}
          />

          {state?.success === false && !fieldError ? (
            <Alert tone="error">{state.error}</Alert>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" isLoading={isPending}>
              <Trash2 className="size-4.5" aria-hidden="true" />
              {labels.submit}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {labels.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="outline" className="mt-5" onClick={() => setOpen(true)}>
          {labels.title}
        </Button>
      )}
    </section>
  );
}
