import type { Metadata } from 'next';

import { SignUpForm } from '@/components/auth/SignUpForm';
import { Logo } from '@/components/common/Logo';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description:
    'Créez gratuitement votre compte Daghoip Ikassa et publiez vos annonces partout au Gabon.',
  robots: { index: false, follow: true },
};

export default function SignUpPage() {
  return (
    <div className="container-app flex max-w-md flex-col py-10 sm:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logo size={64} href={null} />
        <h1 className="mt-5 text-2xl font-extrabold text-brand-900">Créer un compte</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Gratuit, sans commission, en moins d’une minute.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <SignUpForm />
      </div>
    </div>
  );
}
