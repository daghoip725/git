'use client';

import { useActionState } from 'react';

import { updateProfileAction } from '@/app/actions/profile.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import type { ActionResult, Profile } from '@/types';
import { GABON_CITY_NAMES } from '@/utils/constants';
import { formatGabonPhone } from '@/utils/phone';

export interface ProfileFormProps {
  profile: Profile;
  email: string;
}

export function ProfileForm({ profile, email }: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    updateProfileAction,
    null,
  );

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="space-y-5">
      <Input
        label="Adresse e-mail"
        value={email}
        readOnly
        disabled
        hint="L’adresse e-mail ne peut pas être modifiée ici."
      />

      <Input
        name="fullName"
        label="Nom complet"
        required
        defaultValue={profile.full_name}
        error={fieldError('fullName')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          label="Téléphone"
          defaultValue={formatGabonPhone(profile.phone)}
          placeholder="06 12 34 56 78"
          error={fieldError('phone')}
        />
        <Input
          name="whatsapp"
          type="tel"
          inputMode="tel"
          label="WhatsApp"
          defaultValue={formatGabonPhone(profile.whatsapp)}
          placeholder="06 12 34 56 78"
          error={fieldError('whatsapp')}
        />
      </div>

      <Select
        name="city"
        label="Ville"
        options={GABON_CITY_NAMES.map((city) => ({ value: city, label: city }))}
        placeholder="Choisissez votre ville"
        defaultValue={profile.city ?? ''}
        error={fieldError('city')}
      />

      <Textarea
        name="bio"
        label="Présentation (facultatif)"
        rows={4}
        maxLength={500}
        defaultValue={profile.bio ?? ''}
        placeholder="Présentez votre activité en quelques lignes…"
        error={fieldError('bio')}
      />

      <Checkbox
        name="isProfessional"
        label="Je suis un vendeur professionnel (boutique, entreprise, artisan)"
        defaultChecked={profile.is_professional}
      />

      {state?.success ? <Alert tone="success">Votre profil a bien été mis à jour.</Alert> : null}
      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <Button type="submit" size="lg" isLoading={isPending}>
        Enregistrer les modifications
      </Button>
    </form>
  );
}
