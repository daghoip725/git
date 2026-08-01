import type { Metadata } from 'next';

import { AuthMethodTabs } from '@/components/auth/AuthMethodTabs';
import { AuthDivider, OAuthButtons } from '@/components/auth/OAuthButtons';
import { PhoneAuthForm } from '@/components/auth/PhoneAuthForm';
import { SignInForm } from '@/components/auth/SignInForm';
import { Logo } from '@/components/common/Logo';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous à votre compte Daghoip Ikassa pour gérer vos annonces.',
  robots: { index: false, follow: true },
};

interface PageProps {
  searchParams: Promise<{ next?: string | string[]; erreur?: string | string[] }>;
}

/** Messages d'erreur renvoyés par `/auth/callback`. */
const CALLBACK_ERRORS: Record<string, string> = {
  lien_invalide: 'Ce lien d’authentification est incomplet. Veuillez recommencer.',
  lien_expire: 'Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.',
  acces_refuse: 'Vous avez refusé l’autorisation auprès du fournisseur.',
  compte_suspendu:
    'Votre compte est suspendu. Contactez-nous si vous pensez qu’il s’agit d’une erreur.',
};

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const rawNext = single(params.next);
  // Protection contre les redirections ouvertes : seuls les chemins internes.
  const next = rawNext?.startsWith('/') && !rawNext.startsWith('//') ? rawNext : undefined;

  const errorCode = single(params.erreur);
  const errorMessage = errorCode ? CALLBACK_ERRORS[errorCode] : undefined;

  return (
    <div className="container-app flex max-w-md flex-col py-10 sm:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={64} href={null} />
        <h1 className="mt-5 text-2xl font-extrabold text-brand-900">Bon retour parmi nous</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Connectez-vous pour gérer vos annonces et vos favoris.
        </p>
      </div>

      <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        {errorMessage ? <Alert tone="error">{errorMessage}</Alert> : null}

        <OAuthButtons next={next} />

        <AuthDivider />

        <AuthMethodTabs
          emailPanel={<SignInForm next={next} />}
          phonePanel={<PhoneAuthForm next={next} />}
        />
      </div>
    </div>
  );
}
