'use client';

import { useActionState } from 'react';

import { updateProfileAction } from '@/app/actions/profile.actions';
import { AvatarUploader } from '@/components/account/AvatarUploader';
import { PhoneVerification } from '@/components/account/PhoneVerification';
import { VerifiedBadge } from '@/components/common/VerifiedBadge';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/Field';
import type { ActionResult, UserProfile } from '@/types';
import { GABON_CITY_NAMES } from '@/utils/constants';
import { formatGabonPhone } from '@/utils/phone';

export interface ProfileFormProps {
  profile: UserProfile;
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
    <div className="space-y-6">
      {profile.is_verified ? (
        <div className="flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3.5">
          <VerifiedBadge variant="full" />
          <span className="text-sm text-neutral-700">
            Votre identité a été vérifiée par notre équipe.
          </span>
        </div>
      ) : null}

      <PhoneVerification currentPhone={profile.phone} isVerified={profile.phone_verified} />

      <form action={formAction} className="space-y-5">
        <AvatarUploader
          userId={profile.id}
          fullName={profile.full_name}
          initialPath={profile.avatar_path}
        />

        <Input
          label="Adresse e-mail"
          value={email}
          readOnly
          disabled
          hint={
            profile.email_verified
              ? 'Adresse vérifiée. Elle ne peut pas être modifiée ici.'
              : 'Adresse non encore confirmée. Vérifiez votre boîte de réception.'
          }
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
    </div>
  );
}
