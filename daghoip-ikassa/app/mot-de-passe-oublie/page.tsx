'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { requestPasswordResetAction } from '@/app/actions/auth.actions';
import { Logo } from '@/components/common/Logo';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';

export default function ForgotPasswordPage() {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    requestPasswordResetAction,
    null,
  );

  return (
    <div className="container-app flex max-w-md flex-col py-10 sm:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={64} href={null} />
        <h1 className="mt-5 text-2xl font-extrabold text-brand-900">Mot de passe oublié</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Saisissez votre adresse e-mail : nous vous enverrons un lien de réinitialisation.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-card p-6 shadow-sm">
        {state?.success ? (
          <Alert tone="success" title="E-mail envoyé">
            Si un compte est associé à cette adresse, vous recevrez un lien de réinitialisation dans
            quelques instants. Pensez à vérifier vos courriers indésirables.
          </Alert>
        ) : (
          <form action={formAction} className="space-y-4">
            <Input
              name="email"
              type="email"
              label="Adresse e-mail"
              autoComplete="email"
              required
              placeholder="vous@exemple.ga"
              error={state?.success === false ? state.fieldErrors?.email?.[0] : undefined}
            />

            {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

            <Button type="submit" size="lg" fullWidth isLoading={isPending}>
              Envoyer le lien
            </Button>
          </form>
        )}

        <p className="mt-4 text-center text-sm text-neutral-600">
          <Link
            href="/connexion"
            className="font-semibold text-brand-800 underline underline-offset-2"
          >
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
