'use client';

import { useActionState } from 'react';

import { updatePasswordAction } from '@/app/actions/auth.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';

/**
 * Changement de mot de passe. Accessible depuis l'espace compte ou via le lien
 * de réinitialisation envoyé par e-mail (`/auth/callback?next=…`).
 */
export default function ChangePasswordPage() {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    updatePasswordAction,
    null,
  );

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <div className="max-w-md space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">Mot de passe</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Choisissez un mot de passe unique, différent de ceux de vos autres comptes.
        </p>
      </header>

      <form action={formAction} className="space-y-4">
        <Input
          name="password"
          type="password"
          label="Nouveau mot de passe"
          autoComplete="new-password"
          required
          hint="8 caractères minimum, avec au moins une lettre et un chiffre."
          error={fieldError('password')}
        />

        <Input
          name="confirmPassword"
          type="password"
          label="Confirmer le nouveau mot de passe"
          autoComplete="new-password"
          required
          error={fieldError('confirmPassword')}
        />

        {state?.success ? (
          <Alert tone="success">Votre mot de passe a bien été modifié.</Alert>
        ) : null}
        {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

        <Button type="submit" size="lg" isLoading={isPending}>
          Modifier le mot de passe
        </Button>
      </form>
    </div>
  );
}
