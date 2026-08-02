import { Alert } from '@/components/ui/Alert';
import { FeaturePlanForm, SubscriptionPlanForm } from '@/components/admin/PlanEditor';
import { requireRole } from '@/lib/auth/roles';
import { getAllFeaturePlans, getAllSubscriptionPlans } from '@/services/admin.service';
import { LISTING_LIMITS, MESSAGE_LIMITS, SITE } from '@/utils/constants';

/**
 * Paramètres de la plateforme.
 *
 * Ce qui se règle ici est ce qui a un effet **réel** : les tarifs et quotas,
 * relus en base à chaque paiement et à chaque dépôt d'annonce. Les limites
 * techniques figurent en lecture seule — elles vivent dans le code et dans les
 * contraintes SQL, où elles sont vérifiables, plutôt que dans une table de
 * réglages qu'une faute de frappe suffirait à contredire.
 */
export default async function AdminSettingsPage() {
  const role = await requireRole('moderator');

  const [subscriptionPlans, featurePlans] = await Promise.all([
    getAllSubscriptionPlans(),
    getAllFeaturePlans(),
  ]);

  const isAdmin = role === 'admin';

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-brand-900">Paramètres</h2>
        <p className="mt-1 text-sm text-neutral-600">Tarifs, quotas et limites de la plateforme.</p>
      </div>

      {!isAdmin ? (
        <Alert tone="info" title="Consultation seule">
          La modification des tarifs et des quotas est réservée aux administrateurs. La base
          refusera l’enregistrement même si le formulaire l’accepte.
        </Alert>
      ) : null}

      {/* --------------------------- Abonnements --------------------------- */}
      <section aria-labelledby="plans-title" className="space-y-3">
        <div>
          <h3 id="plans-title" className="font-bold text-brand-900">
            Offres d’abonnement
          </h3>
          <p className="text-sm text-neutral-600">
            Le nombre d’annonces simultanées est appliqué par le trigger{' '}
            <code className="text-xs">enforce_ad_quota</code> : modifier ce champ change le quota de
            tous les abonnés à cette offre, immédiatement.
          </p>
        </div>

        {subscriptionPlans.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {subscriptionPlans.map((plan) => (
              <SubscriptionPlanForm key={plan.id} plan={plan} />
            ))}
          </div>
        ) : (
          <Alert tone="warning">
            Aucune offre d’abonnement. Chargez <code className="text-xs">supabase/seed.sql</code>.
          </Alert>
        )}
      </section>

      {/* ------------------------- Mises en avant -------------------------- */}
      <section aria-labelledby="feature-title" className="space-y-3">
        <div>
          <h3 id="feature-title" className="font-bold text-brand-900">
            Offres de mise en avant
          </h3>
          <p className="text-sm text-neutral-600">
            Le formulaire de dépôt n’envoie qu’un code d’offre ; c’est le montant enregistré ici qui
            est facturé, et la durée d’ici qui est appliquée à la confirmation du paiement.
          </p>
        </div>

        {featurePlans.length > 0 ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {featurePlans.map((plan) => (
              <FeaturePlanForm key={plan.id} plan={plan} />
            ))}
          </div>
        ) : (
          <Alert tone="warning">
            Aucune offre de mise en avant. Rejouez la migration{' '}
            <code className="text-xs">…000700_ad_form_features.sql</code>.
          </Alert>
        )}
      </section>

      {/* ------------------------- Limites en dur -------------------------- */}
      <section aria-labelledby="limits-title" className="space-y-3">
        <div>
          <h3 id="limits-title" className="font-bold text-brand-900">
            Limites techniques
          </h3>
          <p className="text-sm text-neutral-600">
            En lecture seule : ces valeurs vivent dans le code et dans les contraintes SQL, où elles
            sont vérifiées à chaque écriture.
          </p>
        </div>

        <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-sm sm:grid-cols-2">
          {[
            ['Site', SITE.name],
            [
              'Titre d’une annonce',
              `${LISTING_LIMITS.titleMin} à ${LISTING_LIMITS.titleMax} caractères`,
            ],
            [
              'Description d’une annonce',
              `${LISTING_LIMITS.descriptionMin} à ${LISTING_LIMITS.descriptionMax} caractères`,
            ],
            ['Photos par annonce', `${LISTING_LIMITS.maxImages} maximum`],
            ['Poids d’une photo', `${Math.round(LISTING_LIMITS.maxImageBytes / 1024 / 1024)} Mo`],
            [
              'Durée de publication',
              `${LISTING_LIMITS.publicationDays} jours par défaut, bornée à 7–90`,
            ],
            ['Longueur d’un message', `${MESSAGE_LIMITS.bodyMax} caractères`],
            [
              'Pièce jointe d’un message',
              `${Math.round(MESSAGE_LIMITS.attachmentMaxBytes / 1024 / 1024)} Mo`,
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex justify-between gap-4 border-b border-neutral-100 py-1.5 last:border-0"
            >
              <dt className="text-neutral-600">{label}</dt>
              <dd className="text-right font-medium text-neutral-900">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
