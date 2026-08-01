'use client';

/** Signalement d'une annonce (modération communautaire). */
import { Flag } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';

import { reportListingAction } from '@/app/actions/reports.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { ActionResult } from '@/types';

const REASONS = [
  { value: 'fraud', label: 'Arnaque ou tentative de fraude' },
  { value: 'prohibited', label: 'Article interdit à la vente' },
  { value: 'spam', label: 'Spam ou publicité' },
  { value: 'duplicate', label: 'Annonce en double' },
  { value: 'wrong_category', label: 'Mauvaise catégorie' },
  { value: 'offensive', label: 'Contenu offensant' },
  { value: 'other', label: 'Autre motif' },
];

export interface ReportDialogProps {
  listingId: string;
  isAuthenticated: boolean;
}

export function ReportDialog({ listingId, isAuthenticated }: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    reportListingAction,
    null,
  );

  // Fermeture automatique après un envoi réussi.
  useEffect(() => {
    if (state?.success) {
      const timer = setTimeout(() => setOpen(false), 1800);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (!isAuthenticated) {
    return (
      <a
        href={`/connexion?next=${encodeURIComponent(`/annonces`)}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-700"
      >
        <Flag className="size-3.5" aria-hidden="true" />
        Signaler cette annonce
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 underline underline-offset-2 transition-colors hover:text-red-600"
      >
        <Flag className="size-3.5" aria-hidden="true" />
        Signaler cette annonce
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Signaler cette annonce"
        description="Votre signalement est confidentiel et sera examiné par notre équipe."
      >
        {state?.success ? (
          <Alert tone="success" title="Signalement enregistré">
            Merci, notre équipe va examiner cette annonce.
          </Alert>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="listingId" value={listingId} />

            <Select
              name="reason"
              label="Motif du signalement"
              options={REASONS}
              placeholder="Choisissez un motif"
              required
              error={state?.success === false ? state.fieldErrors?.reason?.[0] : undefined}
            />

            <Textarea
              name="details"
              label="Précisions (facultatif)"
              rows={4}
              maxLength={1000}
              placeholder="Décrivez le problème rencontré…"
              error={state?.success === false ? state.fieldErrors?.details?.[0] : undefined}
            />

            {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" variant="danger" isLoading={isPending}>
                Envoyer le signalement
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
