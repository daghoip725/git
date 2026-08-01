import { Camera, Plus, Wallet } from 'lucide-react';

import { ButtonLink } from '@/components/ui/Button';

const POINTS = [
  { icon: Wallet, label: 'Gratuit', detail: 'Aucun frais, aucune commission sur vos ventes.' },
  { icon: Camera, label: 'En 2 minutes', detail: 'Quelques photos, un prix, votre ville.' },
  {
    icon: Plus,
    label: '60 jours en ligne',
    detail: 'Renouvelable en un clic depuis votre compte.',
  },
];

/**
 * Encart d'appel à la publication, intercalé entre deux rubriques d'annonces.
 *
 * Placé au milieu de la page plutôt qu'en bas : c'est après avoir parcouru des
 * annonces qu'un visiteur se dit qu'il a, lui aussi, quelque chose à vendre.
 */
export function PublishCTA() {
  return (
    <section aria-labelledby="publish-cta-title" className="container-app">
      <div className="bg-brand-gradient relative isolate overflow-hidden rounded-2xl px-6 py-10 sm:px-10 sm:py-12 lg:px-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full bg-gold-500/20 blur-3xl"
        />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <h2
              id="publish-cta-title"
              className="text-2xl font-extrabold text-balance text-white sm:text-3xl"
            >
              Vous avez quelque chose à vendre ?
            </h2>
            <p className="mt-2 max-w-xl text-white/75">
              Publiez votre annonce et touchez des acheteurs dans les neuf provinces du Gabon.
            </p>

            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {POINTS.map(({ icon: Icon, label, detail }) => (
                <li key={label} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gold-300 ring-1 ring-white/15 ring-inset">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-white">{label}</span>
                    <span className="mt-0.5 block text-xs text-white/60">{detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <ButtonLink
            href="/annonces/nouvelle"
            variant="gold"
            size="lg"
            className="w-full lg:w-auto"
          >
            <Plus className="size-5" aria-hidden="true" />
            Déposer une annonce
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
