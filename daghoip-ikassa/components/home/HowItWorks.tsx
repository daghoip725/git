import { Camera, Handshake, Search, UserPlus } from 'lucide-react';

const STEPS = [
  {
    icon: UserPlus,
    title: 'Créez votre compte',
    description: 'Inscription gratuite en moins d’une minute avec votre e-mail.',
  },
  {
    icon: Camera,
    title: 'Publiez votre annonce',
    description: 'Ajoutez jusqu’à 8 photos, un prix en FCFA et votre ville.',
  },
  {
    icon: Search,
    title: 'Recevez des contacts',
    description: 'Les acheteurs vous joignent par téléphone, WhatsApp ou messagerie.',
  },
  {
    icon: Handshake,
    title: 'Concluez la vente',
    description: 'Rencontrez l’acheteur dans un lieu public et finalisez en direct.',
  },
];

/** Explication du parcours en 4 étapes (page d'accueil). */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-title" className="bg-surface-muted py-12 sm:py-16">
      <div className="container-app">
        <h2
          id="how-it-works-title"
          className="text-center text-2xl font-extrabold text-brand-900 sm:text-3xl"
        >
          Comment ça marche ?
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-neutral-600">
          Vendre sur Daghoip Ikassa est gratuit, simple et sans commission.
        </p>

        <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="relative rounded-xl border border-neutral-200 bg-white p-5"
            >
              <span className="absolute -top-3 left-5 flex size-7 items-center justify-center rounded-full bg-gold-500 text-sm font-extrabold text-brand-900">
                {index + 1}
              </span>
              <span className="mt-2 flex size-11 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                <step.icon className="size-5.5" aria-hidden="true" />
              </span>
              <h3 className="mt-3 font-bold text-brand-900">{step.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-600">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
