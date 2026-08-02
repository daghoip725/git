'use client';

/**
 * Édition des offres : abonnements et mises en avant.
 *
 * Chaque offre a son propre formulaire, enregistré indépendamment : une grille
 * tarifaire se retouche offre par offre, et un unique bouton « tout
 * enregistrer » ferait courir le risque de publier par mégarde une modification
 * abandonnée sur une autre ligne.
 *
 * Les montants sont en francs CFA **entiers** — le franc CFA n'a pas de
 * subdivision en usage, et un prix stocké en entier ne souffre d'aucune erreur
 * d'arrondi.
 */
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { saveFeaturePlanAction, saveSubscriptionPlanAction } from '@/app/actions/catalog.actions';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox, Input } from '@/components/ui/Field';
import type { ActionResult, AdFeaturePlan, SubscriptionPlan } from '@/types';

export function SubscriptionPlanForm({ plan }: { plan: SubscriptionPlan }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    saveSubscriptionPlanAction,
    null,
  );

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="rounded-xl border border-neutral-200 bg-white p-4">
      <input type="hidden" name="id" value={plan.id} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-brand-900">{plan.name}</h3>
        <code className="text-xs text-neutral-500">{plan.code}</code>
        {!plan.is_active ? <Badge tone="danger">Désactivée</Badge> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="name"
          label="Nom affiché"
          required
          maxLength={60}
          defaultValue={plan.name}
          error={fieldError('name')}
        />
        <Input
          name="price"
          label="Prix"
          type="number"
          min={0}
          step={1}
          required
          prefix="FCFA"
          defaultValue={plan.price}
          hint={`Facturation ${plan.billing_interval === 'monthly' ? 'mensuelle' : plan.billing_interval === 'quarterly' ? 'trimestrielle' : 'annuelle'}.`}
          error={fieldError('price')}
        />
        <Input
          name="maxActiveAds"
          label="Annonces simultanées"
          type="number"
          min={1}
          required
          defaultValue={plan.max_active_ads}
          hint="Appliqué par le trigger de quota, pas par l’interface."
          error={fieldError('maxActiveAds')}
        />
        <Input
          name="featuredQuota"
          label="Mises en avant incluses"
          type="number"
          min={0}
          required
          defaultValue={plan.featured_ads_quota}
          error={fieldError('featuredQuota')}
        />
      </div>

      <div className="mt-3">
        <Checkbox
          name="isActive"
          label="Offre proposée aux vendeurs"
          defaultChecked={plan.is_active}
        />
      </div>

      {state?.success === false ? (
        <Alert tone="error" className="mt-3">
          {state.error}
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert tone="success" className="mt-3">
          Offre enregistrée.
        </Alert>
      ) : null}

      <Button type="submit" className="mt-3" isLoading={isPending}>
        Enregistrer
      </Button>
    </form>
  );
}

export function FeaturePlanForm({ plan }: { plan: AdFeaturePlan }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    saveFeaturePlanAction,
    null,
  );

  useEffect(() => {
    if (state?.success) router.refresh();
  }, [router, state]);

  const fieldError = (field: string) =>
    state?.success === false ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={formAction} className="rounded-xl border border-neutral-200 bg-white p-4">
      <input type="hidden" name="id" value={plan.id} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-brand-900">{plan.name}</h3>
        <code className="text-xs text-neutral-500">{plan.code}</code>
        {!plan.is_active ? <Badge tone="danger">Désactivée</Badge> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="name"
          label="Nom affiché"
          required
          maxLength={60}
          defaultValue={plan.name}
          error={fieldError('name')}
        />
        <Input
          name="price"
          label="Prix"
          type="number"
          min={0}
          step={1}
          required
          prefix="FCFA"
          defaultValue={plan.price}
          error={fieldError('price')}
        />
        <Input
          name="durationDays"
          label="Durée (jours)"
          type="number"
          min={1}
          max={90}
          required
          defaultValue={plan.duration_days}
          hint="C’est cette valeur, relue en base, qui fixe la durée réellement appliquée au paiement."
          error={fieldError('durationDays')}
        />
      </div>

      <div className="mt-3">
        <Checkbox
          name="isActive"
          label="Offre proposée au dépôt d’annonce"
          defaultChecked={plan.is_active}
        />
      </div>

      {state?.success === false ? (
        <Alert tone="error" className="mt-3">
          {state.error}
        </Alert>
      ) : null}
      {state?.success ? (
        <Alert tone="success" className="mt-3">
          Offre enregistrée.
        </Alert>
      ) : null}

      <Button type="submit" className="mt-3" isLoading={isPending}>
        Enregistrer
      </Button>
    </form>
  );
}
