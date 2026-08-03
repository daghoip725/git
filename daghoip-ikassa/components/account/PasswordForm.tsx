'use client';

/**
 * Formulaire de changement de mot de passe.
 *
 * Le champ « mot de passe actuel » n'est pas toujours affiché : il ne l'est pas
 * au retour du lien de récupération, ni pour un compte créé par Google,
 * Facebook ou SMS qui n'en a jamais eu. La décision est prise côté serveur —
 * cette page ne fait que la refléter, et la Server Action la reprend de son
 * côté sans faire confiance au formulaire.
 */
import { useActionState } from 'react';

import { updatePasswordAction } from '@/app/actions/auth.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';

export interface PasswordFormProps {
  /** Le mot de passe actuel doit-il être demandé ? */
  requiresCurrent: boolean;
}

export function PasswordForm({ requiresCurrent }: PasswordFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    updatePasswordAction,
    null,
  );

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-4">
      {requiresCurrent ? (
        <Input
          name="currentPassword"
          type="password"
          label="Mot de passe actuel"
          autoComplete="current-password"
          required
          hint="Demandé pour éviter qu’une session laissée ouverte suffise à vous verrouiller hors de votre compte."
          error={fieldError('currentPassword')}
        />
      ) : null}

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
        <Alert tone="success" title="Mot de passe modifié">
          Vos autres appareils ont été déconnectés. Vous restez connecté ici.
        </Alert>
      ) : null}
      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <Button type="submit" size="lg" isLoading={isPending}>
        Modifier le mot de passe
      </Button>
    </form>
  );
}
