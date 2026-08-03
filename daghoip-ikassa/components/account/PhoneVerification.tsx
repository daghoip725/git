'use client';

/**
 * Rattachement et vérification d'un numéro de téléphone sur un compte existant
 * (typiquement créé par e-mail ou via Google/Facebook).
 *
 * Un numéro vérifié permet ensuite de se connecter par SMS et rassure les
 * acheteurs. Il est unique : un même numéro ne peut pas être rattaché à deux
 * comptes (index unique côté PostgreSQL).
 */
import { CheckCircle2, Smartphone } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';

import { linkPhoneAction, verifyPhoneChangeAction } from '@/app/actions/auth.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';
import { formatGabonPhoneNational } from '@/utils/phone';

export interface PhoneVerificationProps {
  currentPhone: string | null;
  isVerified: boolean;
}

export function PhoneVerification({ currentPhone, isVerified }: PhoneVerificationProps) {
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);

  const [linkState, linkAction, isLinking] = useActionState<
    ActionResult<{ phone: string }> | null,
    FormData
  >(linkPhoneAction, null);

  const [verifyState, verifyAction, isVerifying] = useActionState<
    ActionResult<null> | null,
    FormData
  >(verifyPhoneChangeAction, null);

  useEffect(() => {
    if (linkState?.success) setPendingPhone(linkState.data.phone);
  }, [linkState]);

  useEffect(() => {
    if (verifyState?.success) setPendingPhone(null);
  }, [verifyState]);

  /* ------------------------------ Déjà vérifié ----------------------------- */
  if (isVerified && currentPhone && !pendingPhone) {
    return (
      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-brand-900">
          <CheckCircle2 className="size-4.5 text-brand-600" aria-hidden="true" />
          Numéro vérifié : {formatGabonPhoneNational(currentPhone)}
        </p>
        <p className="mt-1 text-xs text-neutral-600">
          Vous pouvez vous connecter par SMS avec ce numéro.
        </p>
      </div>
    );
  }

  /* --------------------------- Saisie du code SMS -------------------------- */
  if (pendingPhone) {
    return (
      <form action={verifyAction} className="space-y-3 rounded-xl border border-neutral-200 p-4">
        <input type="hidden" name="phone" value={pendingPhone} />

        <Alert tone="info">
          Code envoyé au <strong>{formatGabonPhoneNational(pendingPhone)}</strong>.
        </Alert>

        <Input
          name="token"
          label="Code reçu par SMS"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={8}
          placeholder="123456"
          className="text-center tracking-[0.3em]"
        />

        {verifyState?.success === false ? <Alert tone="error">{verifyState.error}</Alert> : null}

        <div className="flex gap-2">
          <Button type="submit" isLoading={isVerifying}>
            Vérifier
          </Button>
          <Button type="button" variant="ghost" onClick={() => setPendingPhone(null)}>
            Annuler
          </Button>
        </div>
      </form>
    );
  }

  /* ---------------------------- Saisie du numéro --------------------------- */
  return (
    <form action={linkAction} className="space-y-3 rounded-xl border border-neutral-200 p-4">
      <p className="text-sm font-semibold text-brand-900">Vérifier mon numéro</p>
      <p className="text-xs text-neutral-600">
        Un numéro vérifié permet de vous connecter par SMS et rassure les acheteurs.
      </p>

      <Input
        name="phone"
        type="tel"
        inputMode="tel"
        label="Numéro de téléphone"
        required
        defaultValue={currentPhone ? formatGabonPhoneNational(currentPhone) : ''}
        placeholder="06 12 34 56"
      />

      {verifyState?.success ? (
        <Alert tone="success">Votre numéro est désormais vérifié.</Alert>
      ) : null}
      {linkState?.success === false ? <Alert tone="error">{linkState.error}</Alert> : null}

      <Button type="submit" isLoading={isLinking}>
        <Smartphone className="size-4" aria-hidden="true" />
        Recevoir un code
      </Button>
    </form>
  );
}
