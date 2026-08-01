import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ListingForm } from '@/components/listings/ListingForm';
import { Alert } from '@/components/ui/Alert';
import { getCurrentUser } from '@/lib/supabase/server';
import { getCategories } from '@/services/categories.service';
import { getAdFeaturePlans } from '@/services/feature-plans.service';
import { getMyProfile } from '@/services/users.service';

export const metadata: Metadata = {
  title: 'Déposer une annonce',
  description:
    'Publiez gratuitement votre annonce sur Daghoip Ikassa et touchez des acheteurs partout au Gabon.',
  robots: { index: false, follow: true },
};

export default async function NewListingPage() {
  const user = await getCurrentUser();
  // Filet de sécurité : le middleware protège déjà cette route.
  if (!user) redirect('/connexion?next=/annonces/nouvelle');

  const [categories, profile, featurePlans] = await Promise.all([
    getCategories(),
    getMyProfile(),
    getAdFeaturePlans(),
  ]);

  return (
    <div className="container-app max-w-3xl py-6 sm:py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">Déposer une annonce</h1>
        <p className="mt-1 text-neutral-600">
          Publication gratuite et sans commission. Votre annonce reste en ligne 60 jours.
        </p>
      </header>

      {!profile?.phone ? (
        <Alert tone="info" className="mb-6" title="Ajoutez un numéro de téléphone">
          Les annonces avec un numéro joignable reçoivent bien plus de contacts. Vous pouvez le
          saisir directement ci-dessous.
        </Alert>
      ) : null}

      <ListingForm
        userId={user.id}
        categories={categories}
        mode="create"
        defaultPhone={profile?.phone ?? null}
        defaultWhatsapp={profile?.whatsapp ?? null}
        featurePlans={featurePlans}
      />
    </div>
  );
}
