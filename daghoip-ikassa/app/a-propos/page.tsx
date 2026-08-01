import type { Metadata } from 'next';

import { Logo } from '@/components/common/Logo';
import { ButtonLink } from '@/components/ui/Button';
import { GABON_PROVINCES, SITE } from '@/utils/constants';

export const metadata: Metadata = {
  title: 'À propos',
  description:
    'Daghoip Ikassa est la plateforme gabonaise de petites annonces : gratuite, sans commission, pensée pour les usages mobiles du Gabon.',
};

export default function AboutPage() {
  return (
    <div className="container-app max-w-3xl py-8 sm:py-12">
      <header className="mb-8 text-center">
        <Logo size={72} href={null} />
        <h1 className="mt-5 text-2xl font-extrabold text-brand-900 sm:text-3xl">
          La marketplace des Gabonais
        </h1>
        <p className="mt-2 text-neutral-600">{SITE.tagline}</p>
      </header>

      <div className="space-y-6 text-neutral-700">
        <p className="leading-relaxed">
          <strong>{SITE.name}</strong> met en relation acheteurs et vendeurs partout au Gabon, de
          Libreville à Bitam. Notre objectif est simple : permettre à chacun de vendre ce dont il
          n’a plus besoin et de trouver ce qu’il cherche, au juste prix, sans intermédiaire.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              title: 'Gratuit',
              text: 'Publier une annonce ne coûte rien, et il n’y a aucune commission sur vos ventes.',
            },
            {
              title: 'Local',
              text: 'Prix en francs CFA, villes et provinces du Gabon, contact par WhatsApp.',
            },
            {
              title: 'Léger',
              text: 'Conçu pour fonctionner rapidement même sur une connexion mobile limitée.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl border border-neutral-200 bg-white p-4">
              <h2 className="font-bold text-brand-900">{item.title}</h2>
              <p className="mt-1 text-sm text-neutral-600">{item.text}</p>
            </div>
          ))}
        </div>

        <section>
          <h2 className="mb-2 text-lg font-bold text-brand-900">Présents dans tout le pays</h2>
          <p className="leading-relaxed">
            Nos annonces couvrent les neuf provinces gabonaises : {GABON_PROVINCES.join(', ')}.
          </p>
        </section>

        <div className="border-t border-neutral-200 pt-6 text-center">
          <ButtonLink href="/annonces/nouvelle" size="lg" variant="gold">
            Déposer ma première annonce
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
