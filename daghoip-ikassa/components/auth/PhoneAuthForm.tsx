'use client';

/**
 * Connexion par téléphone, en deux étapes :
 *   1. saisie du numéro    → envoi d'un code à 6 chiffres par SMS ;
 *   2. saisie du code      → ouverture de la session.
 *
 * Au Gabon le téléphone est le premier identifiant : un premier envoi crée le
 * compte, les suivants connectent. Il n'y a donc pas d'écran d'inscription
 * distinct pour cette méthode.
 */
import { ArrowLeft, MessageSquareText } from 'lucide-react';
import { useActionState, useEffect, useState } from 'react';

import { sendPhoneOtpAction, verifyPhoneOtpAction } from '@/app/actions/auth.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';
import { formatGabonPhoneNational } from '@/utils/phone';

export interface PhoneAuthFormProps {
  /** Chemin interne vers lequel rediriger après connexion. */
  next?: string;
}

/** Délai avant de pouvoir redemander un code, en secondes. */
const RESEND_DELAY = 45;

export function PhoneAuthForm({ next }: PhoneAuthFormProps) {
  const [phone, setPhone] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const [sendState, sendAction, isSending] = useActionState<
    ActionResult<{ phone: string }> | null,
    FormData
  >(sendPhoneOtpAction, null);

  const [verifyState, verifyAction, isVerifying] = useActionState<
    ActionResult<null> | null,
    FormData
  >(verifyPhoneOtpAction, null);

  // Passage à l'étape 2 dès que le SMS est parti.
  useEffect(() => {
    if (sendState?.success) {
      setPhone(sendState.data.phone);
      setSecondsLeft(RESEND_DELAY);
    }
  }, [sendState]);

  // Compte à rebours avant de pouvoir redemander un code.
  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  /* --------------------------- Étape 1 : le numéro -------------------------- */
  if (!phone) {
    return (
      <form action={sendAction} className="space-y-4">
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          label="Numéro de téléphone"
          required
          placeholder="06 12 34 56"
          hint="Numéro gabonais. Vous recevrez un code à 6 chiffres par SMS."
          error={sendState?.success === false ? sendState.fieldErrors?.phone?.[0] : undefined}
        />

        {sendState?.success === false ? <Alert tone="error">{sendState.error}</Alert> : null}

        <Button type="submit" size="lg" fullWidth isLoading={isSending}>
          <MessageSquareText className="size-4.5" aria-hidden="true" />
          Recevoir mon code
        </Button>

        <p className="text-xs text-neutral-500">
          En continuant, vous acceptez de recevoir un SMS de vérification. Des frais opérateur
          peuvent s’appliquer.
        </p>
      </form>
    );
  }

  /* ---------------------------- Étape 2 : le code --------------------------- */
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setPhone(null)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-brand-800"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Changer de numéro
      </button>

      <Alert tone="info">
        Un code à 6 chiffres a été envoyé au <strong>{formatGabonPhoneNational(phone)}</strong>.
      </Alert>

      <form action={verifyAction} className="space-y-4">
        <input type="hidden" name="phone" value={phone} />
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <Input
          name="token"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          label="Code reçu par SMS"
          required
          maxLength={8}
          placeholder="123456"
          className="text-center text-lg tracking-[0.4em]"
          error={verifyState?.success === false ? verifyState.fieldErrors?.token?.[0] : undefined}
        />

        {verifyState?.success === false ? <Alert tone="error">{verifyState.error}</Alert> : null}

        <Button type="submit" size="lg" fullWidth isLoading={isVerifying}>
          Me connecter
        </Button>
      </form>

      <form action={sendAction}>
        <input type="hidden" name="phone" value={phone} />
        <Button
          type="submit"
          variant="ghost"
          fullWidth
          disabled={secondsLeft > 0 || isSending}
          isLoading={isSending}
        >
          {secondsLeft > 0 ? `Renvoyer un code dans ${secondsLeft}s` : 'Renvoyer un code'}
        </Button>
      </form>
    </div>
  );
}
