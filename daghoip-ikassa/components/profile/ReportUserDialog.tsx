'use client';

/**
 * Signalement d'un compte, depuis sa fiche publique.
 *
 * Séparé du signalement d'annonce, et pas seulement par la cible : l'arnaqueur
 * type ne publie pas une mauvaise annonce, il en publie dix correctes et
 * démarche en messagerie. Sans ce bouton, la seule façon de le désigner était
 * de signaler une annonce irréprochable — ce qui égarait le modérateur.
 *
 * Les motifs proposés diffèrent donc aussi : « mauvaise catégorie » n'a aucun
 * sens pour une personne, « harcèlement » n'en a aucun pour une annonce.
 */
import { Flag } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';

import { reportUserAction } from '@/app/actions/reports.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import type { ActionResult } from '@/types';

const REASONS = [
  { value: 'fraud', label: 'Arnaque ou tentative de fraude' },
  { value: 'fake_profile', label: 'Faux profil ou usurpation d’identité' },
  { value: 'harassment', label: 'Harcèlement ou intimidation' },
  { value: 'offensive', label: 'Propos offensants' },
  { value: 'spam', label: 'Spam ou démarchage répété' },
  { value: 'other', label: 'Autre motif' },
];

export interface ReportUserDialogProps {
  userId: string;
  userName: string;
  isAuthenticated: boolean;
  /** `true` si le visiteur regarde sa propre fiche : rien à afficher. */
  isSelf: boolean;
}

export function ReportUserDialog({
  userId,
  userName,
  isAuthenticated,
  isSelf,
}: ReportUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    reportUserAction,
    null,
  );

  useEffect(() => {
    if (state?.success) {
      const timer = setTimeout(() => setOpen(false), 2200);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (isSelf) return null;

  if (!isAuthenticated) {
    return (
      <a
        href={`/connexion?next=${encodeURIComponent(`/vendeurs/${userId}`)}`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-700"
      >
        <Flag className="size-3.5" aria-hidden="true" />
        Signaler ce compte
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 underline underline-offset-2 hover:text-neutral-700"
      >
        <Flag className="size-3.5" aria-hidden="true" />
        Signaler ce compte
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Signaler ${userName}`}>
        {state?.success ? (
          <Alert tone="success" title="Signalement transmis">
            Notre équipe examinera ce compte. Vous ne serez pas informé de la suite donnée, et le
            compte signalé ne saura pas qui l’a signalé.
          </Alert>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="userId" value={userId} />

            <Select
              name="reason"
              label="Motif du signalement"
              required
              options={REASONS}
              placeholder="Choisissez un motif"
              error={state?.success === false ? state.fieldErrors?.reason?.[0] : undefined}
            />

            <Textarea
              name="details"
              label="Précisions (facultatif)"
              rows={4}
              maxLength={1000}
              placeholder="Décrivez ce qui s’est passé : dates, montants, ce qui vous a été demandé…"
              hint="Des faits précis aident bien plus qu’un jugement général."
              error={state?.success === false ? state.fieldErrors?.details?.[0] : undefined}
            />

            {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

            <p className="text-xs text-neutral-500">
              Un signalement ouvre un dossier examiné par une personne. Aucun compte n’est bloqué
              automatiquement par un nombre de signalements.
            </p>

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
