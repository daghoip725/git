import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ProfileForm } from '@/components/account/ProfileForm';
import { Alert } from '@/components/ui/Alert';
import { getCurrentUser } from '@/lib/supabase/server';
import { getMyProfile } from '@/services/profiles.service';

export const metadata: Metadata = {
  title: 'Mon profil',
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/profil');

  const profile = await getMyProfile();

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">Mon profil</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Ces informations aident les acheteurs à vous faire confiance. Votre téléphone n’est jamais
          affiché publiquement sans votre accord.
        </p>
      </header>

      {profile ? (
        <ProfileForm profile={profile} email={user.email ?? ''} />
      ) : (
        <Alert tone="error" title="Profil introuvable">
          Nous n’avons pas pu charger votre profil. Déconnectez-vous puis reconnectez-vous.
        </Alert>
      )}
    </div>
  );
}
