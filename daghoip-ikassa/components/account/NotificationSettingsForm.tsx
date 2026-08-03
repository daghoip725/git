'use client';

/**
 * Réglages des notifications par e-mail.
 *
 * Les cases sont groupées par **ce que l'utilisateur risque de manquer**, pas
 * par type technique : « quelqu'un vous écrit » lui parle, « notification de
 * type new_message » non.
 *
 * La notification dans l'application n'est pas réglable. Elle ne dérange
 * personne — elle attend dans la cloche — et pouvoir la désactiver reviendrait
 * à laisser quelqu'un manquer une réponse à sa propre annonce.
 */
import { Check } from 'lucide-react';
import { useActionState } from 'react';

import { saveNotificationSettingsAction } from '@/app/actions/notifications.settings.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Checkbox, Select } from '@/components/ui/Field';
import type { ActionResult } from '@/types';

export interface NotificationSettingsValues {
  emailMessages: boolean;
  emailAdStatus: boolean;
  emailReviews: boolean;
  emailPayments: boolean;
  emailSubscription: boolean;
  messageDelay: number;
}

const DELAY_OPTIONS = [
  { value: '0', label: 'Immédiatement' },
  { value: '10', label: 'Après 10 minutes' },
  { value: '30', label: 'Après 30 minutes' },
  { value: '60', label: 'Après 1 heure' },
];

export interface NotificationSettingsFormProps {
  values: NotificationSettingsValues;
  /** `false` quand aucun fournisseur d'e-mail n'est configuré sur l'instance. */
  emailAvailable: boolean;
}

export function NotificationSettingsForm({
  values,
  emailAvailable,
}: NotificationSettingsFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    saveNotificationSettingsAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-6">
      {!emailAvailable ? (
        <Alert tone="info" title="Envoi d’e-mails non activé sur cette instance">
          Vos réglages sont enregistrés et s’appliqueront dès que l’envoi sera configuré. En
          attendant, toutes vos notifications restent disponibles dans la cloche.
        </Alert>
      ) : null}

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-neutral-800">
          Me prévenir par e-mail quand…
        </legend>

        <Checkbox
          name="emailMessages"
          label="Quelqu’un m’envoie un message"
          defaultChecked={values.emailMessages}
          hint="L’e-mail n’est pas envoyé si vous avez déjà lu le message."
        />
        <Checkbox
          name="emailAdStatus"
          label="Une de mes annonces change d’état"
          defaultChecked={values.emailAdStatus}
          hint="Approbation, retrait, expiration prochaine."
        />
        <Checkbox
          name="emailPayments"
          label="Un paiement aboutit ou échoue"
          defaultChecked={values.emailPayments}
        />
        <Checkbox
          name="emailSubscription"
          label="Mon abonnement arrive à échéance"
          defaultChecked={values.emailSubscription}
        />
        <Checkbox
          name="emailReviews"
          label="Je reçois un avis"
          defaultChecked={values.emailReviews}
        />
      </fieldset>

      <Select
        name="messageDelay"
        label="Délai avant l’e-mail de nouveau message"
        defaultValue={String(values.messageDelay)}
        options={DELAY_OPTIONS}
        hint="Ce délai laisse le temps de répondre depuis l’application : si vous lisez le message avant l’échéance, aucun e-mail n’est envoyé."
      />

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}
      {state?.success ? (
        <Alert tone="success">
          <span className="inline-flex items-center gap-1.5">
            <Check className="size-4" aria-hidden="true" />
            Préférences enregistrées.
          </span>
        </Alert>
      ) : null}

      <Button type="submit" isLoading={isPending}>
        Enregistrer mes préférences
      </Button>

      <p className="text-xs text-neutral-500">
        Les notifications dans l’application ne se désactivent pas : elles attendent sagement dans
        la cloche, et vous éviteront de manquer une réponse à votre annonce.
      </p>
    </form>
  );
}
