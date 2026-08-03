/**
 * Changement de mot de passe. Accessible depuis l'espace compte ou via le lien
 * de réinitialisation envoyé par e-mail (`/auth/callback?next=…`).
 *
 * La page décide ici, côté serveur, s'il faut demander le mot de passe actuel.
 * Elle **lit** le marqueur de récupération sans le consommer : c'est la Server
 * Action qui l'efface, au moment où elle s'en sert. Le lire ici pour l'effacer
 * ferait échouer un second essai après une simple faute de frappe.
 */
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { PasswordForm } from '@/components/account/PasswordForm';
import { RECOVERY_COOKIE } from '@/lib/auth/recovery';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Mot de passe',
  robots: { index: false, follow: false },
};

export default async function ChangePasswordPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/compte/mot-de-passe');

  const [store, supabase] = await Promise.all([cookies(), createClient()]);
  const fromRecovery = store.get(RECOVERY_COOKIE)?.value === '1';

  // Un compte créé par Google, Facebook ou SMS n'a pas d'identité « email » :
  // il n'a donc aucun mot de passe à confirmer, il s'en définit un premier.
  const { data: identities } = await supabase.auth.getUserIdentities();
  const hasPassword = (identities?.identities ?? []).some(
    (identity) => identity.provider === 'email',
  );

  const requiresCurrent = hasPassword && !fromRecovery;

  return (
    <div className="max-w-md space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-brand-900">
          {hasPassword ? 'Mot de passe' : 'Définir un mot de passe'}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {hasPassword
            ? 'Choisissez un mot de passe unique, différent de ceux de vos autres comptes.'
            : 'Votre compte n’en a pas encore : vous vous connectez par un autre moyen. En définir un vous donne une seconde façon d’entrer.'}
        </p>
      </header>

      <PasswordForm requiresCurrent={requiresCurrent} />
    </div>
  );
}
