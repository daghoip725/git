'use client';

/**
 * Confirmation manuelle d'un règlement hors ligne.
 *
 * L'action est irréversible — elle crédite un abonnement et émet une facture —
 * d'où la confirmation explicite avec saisie d'une référence de justificatif.
 * `admin_confirm_payment()` revérifie `is_admin()` : ce bouton n'accorde aucun
 * pouvoir, il rend seulement accessible celui que la base reconnaît déjà.
 */
import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { confirmPaymentAction } from '@/app/actions/admin.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

export interface ConfirmPaymentButtonProps {
  paymentId: string;
  reference: string;
}

export function ConfirmPaymentButton({ paymentId, reference }: ConfirmPaymentButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await confirmPaymentAction(paymentId, note);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setNote('');
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Check className="size-4" aria-hidden="true" />
        Confirmer
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Confirmer ce règlement">
        <div className="space-y-4">
          <p className="text-sm text-neutral-700">
            Le paiement <strong className="font-mono">{reference}</strong> sera marqué comme réglé,
            une facture sera émise et la prestation activée. Cette opération ne s’annule pas.
          </p>

          <Input
            label="Justificatif (facultatif)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder="Ex. : virement BGFI du 02/08, réf. 4471"
            hint="Conservé dans le journal des paiements, avec votre identité."
          />

          {error ? <Alert tone="error">{error}</Alert> : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="button" onClick={submit} isLoading={isPending}>
              Confirmer le règlement
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
