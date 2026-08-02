'use client';

/**
 * Formulaire d'engagement d'un paiement.
 *
 * Il n'envoie **jamais** de montant : seulement un code d'offre et le moyen de
 * paiement choisi. Le tarif affiché à côté n'a qu'une valeur d'information — la
 * base relit le sien.
 *
 * Le formulaire sert les deux parcours (abonnement et mise en avant) : seule
 * l'action serveur change, passée en prop. Les deux répondent le même
 * `CheckoutData`, dont on affiche la suite à donner.
 */
import { Loader2, Smartphone } from 'lucide-react';
import { useActionState, useState } from 'react';

import type { CheckoutData } from '@/app/actions/payments.actions';
import type { ProviderOption } from '@/lib/payments/registry';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import type { ActionResult } from '@/types';
import { cn } from '@/utils/cn';

type CheckoutAction = (
  prev: ActionResult<CheckoutData> | null,
  formData: FormData,
) => Promise<ActionResult<CheckoutData>>;

export interface CheckoutFormProps {
  action: CheckoutAction;
  /** Code de l'offre souscrite : la seule donnée tarifaire transmise. */
  planCode: string;
  /** Identifiant de l'annonce, pour le parcours « mise en avant ». */
  adId?: string;
  providers: ProviderOption[];
  submitLabel: string;
}

export function CheckoutForm({
  action,
  planCode,
  adId,
  providers,
  submitLabel,
}: CheckoutFormProps) {
  const [state, formAction, isPending] = useActionState<ActionResult<CheckoutData> | null, FormData>(
    action,
    null,
  );

  const [selected, setSelected] = useState(providers[0]?.code ?? '');
  const current = providers.find((provider) => provider.code === selected) ?? providers[0];

  if (providers.length === 0) {
    return (
      <Alert tone="warning" title="Paiement en ligne indisponible">
        Aucun moyen de paiement n’est configuré sur cette instance. Contactez l’équipe Daghoip
        Ikassa pour régler votre abonnement.
      </Alert>
    );
  }

  // Paiement engagé : on montre la suite à donner plutôt que le formulaire, qui
  // n'a plus lieu d'être — un second envoi serait refusé par la base.
  if (state?.success) {
    return <CheckoutOutcome data={state.data} />;
  }

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="planCode" value={planCode} />
      {adId ? <input type="hidden" name="adId" value={adId} /> : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-neutral-800">Moyen de paiement</legend>

        {providers.map((provider) => (
          <label
            key={provider.code}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors',
              selected === provider.code
                ? 'border-brand-700 bg-brand-50'
                : 'border-neutral-200 hover:border-neutral-300',
            )}
          >
            <input
              type="radio"
              name="provider"
              value={provider.code}
              checked={selected === provider.code}
              onChange={() => setSelected(provider.code)}
              className="mt-0.5 size-4 accent-[var(--color-brand-700)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-900">{provider.label}</span>
              <span className="block text-xs text-neutral-600">{provider.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {current?.requiresPhone ? (
        <Input
          label="Numéro Mobile Money à débiter"
          name="payerPhone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="06 12 34 56"
          required
          prefix={<Smartphone className="size-4" aria-hidden="true" />}
          hint="Numéro gabonais, avec ou sans l’indicatif +241."
          error={state?.success === false ? state.fieldErrors?.payerPhone?.[0] : undefined}
        />
      ) : null}

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <Button type="submit" size="lg" fullWidth isLoading={isPending} disabled={isPending}>
        {submitLabel}
      </Button>

      <p className="text-xs text-neutral-500">
        Le montant est relu sur nos serveurs au moment du paiement : il ne peut pas être modifié
        depuis votre navigateur.
      </p>
    </form>
  );
}

/** Suite à donner, selon ce que l'opérateur a répondu. */
function CheckoutOutcome({ data }: { data: CheckoutData }) {
  const { initiation, reference } = data;

  if (initiation.kind === 'error') {
    return (
      <div className="space-y-3">
        <Alert tone="error" title="Paiement non engagé">
          {initiation.message}
        </Alert>
        <p className="text-sm text-neutral-600">
          Votre demande reste enregistrée sous la référence{' '}
          <strong className="font-semibold text-neutral-900">{reference}</strong>. Vous pouvez la
          relancer depuis{' '}
          <a href="/compte/paiements" className="font-semibold text-brand-700 underline">
            votre historique de paiements
          </a>
          .
        </p>
      </div>
    );
  }

  if (initiation.kind === 'redirect') {
    return (
      <div className="space-y-3">
        <Alert tone="info" title="Finalisez chez votre opérateur">
          Vous allez être redirigé pour confirmer le paiement.
        </Alert>
        <Button
          type="button"
          size="lg"
          fullWidth
          onClick={() => {
            window.location.href = initiation.url;
          }}
        >
          Continuer vers l’opérateur
        </Button>
      </div>
    );
  }

  if (initiation.kind === 'instructions') {
    return (
      <div className="space-y-3">
        <Alert tone="info" title="Demande enregistrée">
          {initiation.message}
        </Alert>
        <ol className="list-inside list-decimal space-y-1.5 text-sm text-neutral-700">
          {initiation.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-sm text-neutral-600">
          Référence à rappeler :{' '}
          <strong className="font-semibold text-neutral-900">{reference}</strong>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Alert tone="success" title="Demande envoyée sur votre téléphone">
        {initiation.message}
      </Alert>
      <p className="flex items-center gap-2 text-sm text-neutral-600">
        <Loader2 className="size-4 animate-spin text-brand-700" aria-hidden="true" />
        {/* Honnêteté : la confirmation n'arrive pas dans cette page mais par le
            rappel de l'opérateur, qui peut prendre une minute. */}
        La confirmation peut prendre jusqu’à une minute. Vous recevrez une notification.
      </p>
      <p className="text-sm text-neutral-600">
        Référence :{' '}
        <strong className="font-semibold text-neutral-900">{reference}</strong> — suivi dans{' '}
        <a href="/compte/paiements" className="font-semibold text-brand-700 underline">
          votre historique
        </a>
        .
      </p>
    </div>
  );
}
