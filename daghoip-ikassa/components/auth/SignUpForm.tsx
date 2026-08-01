'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { signUpAction } from '@/app/actions/auth.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select } from '@/components/ui/Field';
import type { ActionResult } from '@/types';
import { GABON_CITY_NAMES } from '@/utils/constants';

export function SignUpForm() {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    signUpAction,
    null,
  );

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  if (state?.success) {
    return (
      <Alert tone="success" title="Compte créé">
        <p>
          Un e-mail de confirmation vous a été envoyé. Cliquez sur le lien qu’il contient pour
          activer votre compte, puis connectez-vous.
        </p>
        <Link
          href="/connexion"
          className="mt-3 inline-block font-semibold text-brand-700 underline underline-offset-2"
        >
          Aller à la page de connexion
        </Link>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <Input
        name="fullName"
        label="Nom complet"
        autoComplete="name"
        required
        placeholder="Ex. Marie Ndong"
        error={fieldError('fullName')}
      />

      <Input
        name="email"
        type="email"
        label="Adresse e-mail"
        autoComplete="email"
        required
        placeholder="vous@exemple.ga"
        error={fieldError('email')}
      />

      <Input
        name="phone"
        type="tel"
        inputMode="tel"
        label="Téléphone (facultatif)"
        autoComplete="tel"
        placeholder="06 12 34 56 78"
        hint="Numéro gabonais, utilisé pour vos annonces."
        error={fieldError('phone')}
      />

      <Select
        name="city"
        label="Ville (facultatif)"
        options={GABON_CITY_NAMES.map((city) => ({ value: city, label: city }))}
        placeholder="Choisissez votre ville"
        error={fieldError('city')}
      />

      <Input
        name="password"
        type="password"
        label="Mot de passe"
        autoComplete="new-password"
        required
        hint="8 caractères minimum, avec au moins une lettre et un chiffre."
        error={fieldError('password')}
      />

      <Input
        name="confirmPassword"
        type="password"
        label="Confirmer le mot de passe"
        autoComplete="new-password"
        required
        error={fieldError('confirmPassword')}
      />

      <Checkbox
        name="acceptTerms"
        required
        error={fieldError('acceptTerms')}
        label={
          <>
            J’accepte les{' '}
            <Link href="/conditions" className="text-brand-700 underline underline-offset-2">
              conditions d’utilisation
            </Link>{' '}
            et la{' '}
            <Link href="/confidentialite" className="text-brand-700 underline underline-offset-2">
              politique de confidentialité
            </Link>
            .
          </>
        }
      />

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <Button type="submit" size="lg" fullWidth isLoading={isPending}>
        Créer mon compte
      </Button>

      <p className="text-center text-sm text-neutral-600">
        Déjà inscrit ?{' '}
        <Link
          href="/connexion"
          className="font-semibold text-brand-700 underline underline-offset-2"
        >
          Se connecter
        </Link>
      </p>
    </form>
  );
}
