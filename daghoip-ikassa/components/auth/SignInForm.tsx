'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { signInAction } from '@/app/actions/auth.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';

export interface SignInFormProps {
  /** Chemin interne vers lequel rediriger après connexion. */
  next?: string;
}

export function SignInForm({ next }: SignInFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    signInAction,
    null,
  );

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Input
        name="email"
        type="email"
        label="Adresse e-mail"
        autoComplete="email"
        required
        placeholder="vous@exemple.ga"
        error={fieldError('email')}
      />

      <div className="space-y-1.5">
        <Input
          name="password"
          type="password"
          label="Mot de passe"
          autoComplete="current-password"
          required
          error={fieldError('password')}
        />
        <Link
          href="/mot-de-passe-oublie"
          className="block text-right text-xs font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          Mot de passe oublié ?
        </Link>
      </div>

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <Button type="submit" size="lg" fullWidth isLoading={isPending}>
        Se connecter
      </Button>

      <p className="text-center text-sm text-neutral-600">
        Pas encore de compte ?{' '}
        <Link
          href="/inscription"
          className="font-semibold text-brand-700 underline underline-offset-2"
        >
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
