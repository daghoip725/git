import type { Metadata } from 'next';

import { SignInForm } from '@/components/auth/SignInForm';
import { Logo } from '@/components/common/Logo';

export const metadata: Metadata = {
  title: 'Connexion',
  description: 'Connectez-vous à votre compte Daghoip Ikassa pour gérer vos annonces.',
  robots: { index: false, follow: true },
};

interface PageProps {
  searchParams: Promise<{ next?: string | string[] }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;

  // Protection contre les redirections ouvertes : seuls les chemins internes.
  const next = rawNext?.startsWith('/') && !rawNext.startsWith('//') ? rawNext : undefined;

  return (
    <div className="container-app flex max-w-md flex-col py-10 sm:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={64} href={null} />
        <h1 className="mt-5 text-2xl font-extrabold text-brand-900">Bon retour parmi nous</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Connectez-vous pour gérer vos annonces et vos favoris.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <SignInForm next={next} />
      </div>
    </div>
  );
}
