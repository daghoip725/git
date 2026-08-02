/**
 * Offres Premium.
 *
 * Publique : un visiteur non connecté doit pouvoir comparer les offres avant de
 * créer un compte. Le formulaire de paiement, lui, n'apparaît qu'une fois
 * connecté — et l'action serveur revérifie la session de toute façon.
 */
import { ArrowRight, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { CheckoutForm } from '@/components/payments/CheckoutForm';
import { PlanCard } from '@/components/payments/PlanCard';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { listAvailableProviders } from '@/lib/payments/registry';
import { getCurrentUser } from '@/lib/supabase/server';
import { getActiveSubscription, getSubscriptionPlans } from '@/services/billing.service';
import { startSubscriptionAction } from '@/app/actions/payments.actions';
import { formatLongDate } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Abonnement Premium',
  description:
    'Vendez plus vite sur Daghoip Ikassa : plus d’annonces en ligne, plus de photos, mises en avant incluses et badge vendeur vérifié.',
};

interface PageProps {
  searchParams: Promise<{ offre?: string }>;
}

export default async function PremiumPage({ searchParams }: PageProps) {
  const [{ offre }, plans, user] = await Promise.all([
    searchParams,
    getSubscriptionPlans(),
    getCurrentUser(),
  ]);

  const providers = listAvailableProviders();
  const subscription = user ? await getActiveSubscription(user.id) : null;

  const paidPlans = plans.filter((plan) => plan.price > 0);
  // L'offre à souscrire : celle demandée dans l'URL si elle existe, sinon la
  // plus mise en avant du catalogue (position la plus élevée parmi les
  // mensuelles), à défaut la première payante.
  const selected =
    paidPlans.find((plan) => plan.code === offre) ??
    paidPlans.find((plan) => plan.code === 'pro') ??
    paidPlans[0];

  const activePlanCode = subscription?.plan?.code ?? null;

  return (
    <div className="container-app space-y-10 py-8 sm:py-12">
      <header className="mx-auto max-w-2xl text-center">
        <Badge tone="gold">Daghoip Ikassa Premium</Badge>
        <h1 className="mt-3 text-3xl font-extrabold text-brand-900 sm:text-4xl">
          Donnez plus de visibilité à vos annonces
        </h1>
        <p className="mt-3 text-neutral-600">
          Publiez davantage, montrez plus de photos et passez devant dans les résultats. Sans
          engagement : votre abonnement s’arrête quand vous le décidez.
        </p>
      </header>

      {subscription?.plan ? (
        <Alert tone="success" title={`Vous êtes abonné à l’offre ${subscription.plan.name}`}>
          Période en cours jusqu’au {formatLongDate(subscription.current_period_end)}.{' '}
          <Link href="/compte/paiements" className="font-semibold underline">
            Voir mes paiements et factures
          </Link>
        </Alert>
      ) : null}

      <section aria-labelledby="offres-titre" className="space-y-4">
        <h2 id="offres-titre" className="sr-only">
          Comparatif des offres
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              highlighted={plan.code === selected?.code}
              ribbon={plan.code === activePlanCode ? 'Votre offre' : undefined}
              footer={
                plan.price === 0 ? (
                  <p className="text-xs text-neutral-500">Offre par défaut de tout nouveau compte.</p>
                ) : plan.code === activePlanCode ? (
                  <p className="text-xs font-medium text-brand-700">Offre actuellement active.</p>
                ) : (
                  <ButtonLink
                    href={`/premium?offre=${plan.code}#souscrire`}
                    variant={plan.code === selected?.code ? 'primary' : 'outline'}
                    fullWidth
                  >
                    Choisir cette offre
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </ButtonLink>
                )
              }
            />
          ))}
        </div>
      </section>

      {selected ? (
        <section
          id="souscrire"
          aria-labelledby="souscrire-titre"
          className="mx-auto max-w-xl scroll-mt-28 rounded-xl border border-neutral-200 bg-white p-5 sm:p-6"
        >
          <h2 id="souscrire-titre" className="text-xl font-bold text-brand-900">
            Souscrire à l’offre {selected.name}
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            Montant à régler : <strong>{selected.price.toLocaleString('fr-GA')} FCFA</strong>.
          </p>

          <div className="mt-5">
            {user ? (
              <CheckoutForm
                action={startSubscriptionAction}
                planCode={selected.code}
                providers={providers}
                submitLabel="Payer et activer mon abonnement"
              />
            ) : (
              <div className="space-y-3">
                <Alert tone="info">
                  Connectez-vous pour souscrire. Votre choix d’offre est conservé.
                </Alert>
                <ButtonLink
                  href={`/connexion?next=${encodeURIComponent(`/premium?offre=${selected.code}`)}`}
                  size="lg"
                  fullWidth
                >
                  Se connecter et souscrire
                </ButtonLink>
              </div>
            )}
          </div>

          <p className="mt-5 flex items-start gap-2 text-xs text-neutral-500">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
            Daghoip Ikassa ne conserve jamais votre code secret Mobile Money : la confirmation se
            fait sur votre téléphone, chez votre opérateur.
          </p>
        </section>
      ) : null}
    </div>
  );
}
