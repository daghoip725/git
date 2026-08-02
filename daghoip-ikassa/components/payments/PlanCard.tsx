/**
 * Carte d'une offre d'abonnement.
 *
 * Les avantages sont écrits en toutes lettres plutôt que sous forme de coches
 * face à une grille de colonnes : sur un écran de téléphone — la majorité des
 * visites au Gabon — un tableau comparatif se lit mal, et les colonnes finissent
 * par déborder.
 */
import { Check, Crown } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/Badge';
import type { SubscriptionPlan } from '@/types';
import { cn } from '@/utils/cn';
import { formatPrice } from '@/utils/format';

const INTERVAL_LABELS: Record<SubscriptionPlan['billing_interval'], string> = {
  monthly: 'par mois',
  quarterly: 'par trimestre',
  yearly: 'par an',
};

/** Avantages d'une offre, formulés depuis les quotas réels de la table. */
export function planBenefits(plan: SubscriptionPlan): string[] {
  const benefits = [
    `${plan.max_active_ads} annonces en ligne simultanément`,
    `${plan.max_images_per_ad} photos par annonce`,
  ];

  if (plan.featured_ads_quota > 0) {
    benefits.push(
      `${plan.featured_ads_quota} mise${plan.featured_ads_quota > 1 ? 's' : ''} en avant incluse${
        plan.featured_ads_quota > 1 ? 's' : ''
      }`,
    );
  }
  if (plan.has_verified_badge) benefits.push('Badge vendeur vérifié');
  if (plan.has_priority_support) benefits.push('Assistance prioritaire');

  return benefits;
}

export interface PlanCardProps {
  plan: SubscriptionPlan;
  /** Met la carte en avant : offre la plus choisie, ou offre en cours. */
  highlighted?: boolean;
  /** Libellé du bandeau d'angle, quand il y en a un. */
  ribbon?: string;
  /** Bouton ou message affiché en pied de carte. */
  footer?: ReactNode;
}

export function PlanCard({ plan, highlighted = false, ribbon, footer }: PlanCardProps) {
  const price = plan.price === 0 ? 'Gratuit' : formatPrice(plan.price);

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-xl border bg-white p-5',
        highlighted ? 'border-gold-400 ring-1 ring-gold-300' : 'border-neutral-200',
      )}
    >
      {ribbon ? (
        <Badge tone="gold" className="absolute -top-3 left-5">
          <Crown className="size-3" aria-hidden="true" />
          {ribbon}
        </Badge>
      ) : null}

      <h3 className="text-lg font-bold text-brand-900">{plan.name}</h3>
      {plan.description ? (
        <p className="mt-1 text-sm text-neutral-600">{plan.description}</p>
      ) : null}

      <p className="mt-4">
        <span className="text-3xl font-extrabold text-brand-900 tabular-nums">{price}</span>
        {plan.price > 0 ? (
          // `whitespace-nowrap` : sans lui, « par mois » se coupe entre « par »
          // et « mois » dès que le prix est long (150 000 FCFA sur une colonne
          // étroite). L'intervalle passe à la ligne d'un bloc, jamais en deux.
          <span className="ml-1.5 inline-block text-sm whitespace-nowrap text-neutral-500">
            {INTERVAL_LABELS[plan.billing_interval]}
          </span>
        ) : null}
      </p>

      <ul className="mt-4 flex-1 space-y-2 text-sm text-neutral-700">
        {planBenefits(plan).map((benefit) => (
          <li key={benefit} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
            {benefit}
          </li>
        ))}
      </ul>

      {footer ? <div className="mt-5">{footer}</div> : null}
    </article>
  );
}
