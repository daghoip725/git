/**
 * Mise en avant d'une annonce déjà publiée (« annonce sponsorisée »).
 *
 * Le parcours est le même que l'abonnement : on n'envoie qu'un code d'offre,
 * `request_ad_feature()` relit le tarif dans `ad_feature_plans` et vérifie que
 * l'annonce appartient bien au payeur. La vérification de propriété ci-dessous
 * n'est donc pas la sécurité — elle évite seulement d'afficher un formulaire
 * qui serait refusé.
 */
import { Megaphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { startAdFeatureAction } from '@/app/actions/payments.actions';
import { CheckoutForm } from '@/components/payments/CheckoutForm';
import { Alert } from '@/components/ui/Alert';
import { listAvailableProviders } from '@/lib/payments/registry';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { getAdFeaturePlans } from '@/services/feature-plans.service';
import { formatLongDate, formatPrice } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Mettre en avant mon annonce',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offre?: string }>;
}

export default async function AdFeaturePage({ params, searchParams }: PageProps) {
  const [{ id }, { offre }] = await Promise.all([params, searchParams]);

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=/compte/annonces/${id}/mise-en-avant`);

  const supabase = await createClient();
  const { data: ad } = await supabase
    .from('ads')
    .select('id, title, status, is_featured, featured_until, seller_id')
    .eq('id', id)
    .maybeSingle();

  if (!ad || ad.seller_id !== user.id) notFound();

  const plans = await getAdFeaturePlans();
  const providers = listAvailableProviders();
  const selected = plans.find((plan) => plan.code === offre) ?? plans[0];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-neutral-500">
          <Link href="/compte/annonces" className="font-semibold text-brand-700 hover:underline">
            Mes annonces
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-brand-900">Mettre en avant mon annonce</h1>
        <p className="mt-1 text-sm text-neutral-600">{ad.title}</p>
      </header>

      {ad.status !== 'published' ? (
        <Alert tone="warning" title="Cette annonce n’est pas en ligne">
          Une mise en avant n’a d’effet que sur une annonce publiée. Publiez-la d’abord, puis
          revenez ici.
        </Alert>
      ) : null}

      {ad.is_featured && ad.featured_until ? (
        <Alert tone="info" title="Annonce déjà mise en avant">
          Jusqu’au {formatLongDate(ad.featured_until)}. Un nouveau paiement prolongera cette
          période plutôt que de la remplacer.
        </Alert>
      ) : null}

      {plans.length === 0 ? (
        <Alert tone="warning">Aucune offre de mise en avant n’est disponible actuellement.</Alert>
      ) : (
        <>
          <section aria-labelledby="offres-titre" className="space-y-3">
            <h2 id="offres-titre" className="text-sm font-semibold text-neutral-800">
              Choisir une durée
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => {
                const isSelected = plan.code === selected?.code;
                return (
                  <Link
                    key={plan.id}
                    href={`/compte/annonces/${id}/mise-en-avant?offre=${plan.code}`}
                    scroll={false}
                    aria-current={isSelected ? 'true' : undefined}
                    className={
                      isSelected
                        ? 'rounded-xl border border-brand-700 bg-brand-50 p-4'
                        : 'rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-neutral-300'
                    }
                  >
                    <p className="flex items-center gap-1.5 font-semibold text-neutral-900">
                      <Megaphone className="size-4 text-gold-600" aria-hidden="true" />
                      {plan.name}
                    </p>
                    <p className="mt-1 text-sm text-neutral-600">{plan.duration_days} jours</p>
                    <p className="mt-2 text-lg font-bold text-brand-900 tabular-nums">
                      {formatPrice(plan.price)}
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>

          {selected ? (
            <section
              aria-labelledby="payer-titre"
              className="max-w-xl rounded-xl border border-neutral-200 bg-white p-5"
            >
              <h2 id="payer-titre" className="text-lg font-bold text-brand-900">
                Payer la mise en avant « {selected.name} »
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                {formatPrice(selected.price)} pour {selected.duration_days} jours à la une.
              </p>

              <div className="mt-5">
                <CheckoutForm
                  action={startAdFeatureAction}
                  planCode={selected.code}
                  adId={ad.id}
                  providers={providers}
                  submitLabel="Payer et mettre en avant"
                />
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
