import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';

import { Alert } from '@/components/ui/Alert';
import { SITE } from '@/utils/constants';

export const metadata: Metadata = {
  title: 'Conseils de sécurité',
  description:
    'Nos conseils pour acheter et vendre en toute sécurité sur Daghoip Ikassa au Gabon : rencontres en lieu public, vérification de l’article, paiements Mobile Money.',
};

const DO = [
  'Rencontrez toujours l’autre partie dans un lieu public et fréquenté (marché, centre commercial, agence).',
  'Inspectez l’article en détail avant de payer : état, fonctionnement, accessoires, papiers.',
  'Pour un véhicule ou un terrain, exigez les documents originaux et vérifiez leur authenticité.',
  'Privilégiez un paiement au moment de la remise de l’article, en main propre.',
  'Faites-vous accompagner pour une transaction importante.',
];

const DONT = [
  'N’envoyez jamais d’acompte par Mobile Money à une personne que vous n’avez pas rencontrée.',
  'Ne communiquez jamais vos codes Airtel Money / Moov Money, ni un code reçu par SMS.',
  'Méfiez-vous des prix anormalement bas : c’est le premier signal d’une arnaque.',
  'Refusez les demandes de paiement via un « transporteur » ou un « agent » inconnu.',
  'Ne partagez pas de photos de vos pièces d’identité avec un acheteur ou un vendeur.',
];

export default function SecurityPage() {
  return (
    <div className="container-app max-w-3xl py-8 sm:py-12">
      <header className="mb-8">
        <span className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-brand-50 text-brand-800">
          <ShieldCheck className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">
          Acheter et vendre en toute sécurité
        </h1>
        <p className="mt-2 text-neutral-600">
          {SITE.name} met en relation acheteurs et vendeurs, mais n’intervient pas dans les
          transactions. Quelques réflexes simples suffisent à éviter la grande majorité des
          mauvaises surprises.
        </p>
      </header>

      <section aria-labelledby="do-title" className="mb-8">
        <h2 id="do-title" className="mb-3 flex items-center gap-2 text-lg font-bold text-brand-900">
          <CheckCircle2 className="size-5 text-emerald-800" aria-hidden="true" />
          Les bons réflexes
        </h2>
        <ul className="space-y-2">
          {DO.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-neutral-700"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dont-title" className="mb-8">
        <h2
          id="dont-title"
          className="mb-3 flex items-center gap-2 text-lg font-bold text-brand-900"
        >
          <AlertTriangle className="size-5 text-red-700" aria-hidden="true" />
          Les pièges à éviter
        </h2>
        <ul className="space-y-2">
          {DONT.map((item) => (
            <li
              key={item}
              className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-sm text-neutral-700"
            >
              {item}
            </li>
          ))}
        </ul>
      </section>

      <Alert tone="info" title="Une annonce vous semble suspecte ?">
        Utilisez le lien « Signaler cette annonce » présent sur chaque page d’annonce, ou
        écrivez-nous à{' '}
        <a href={`mailto:${SITE.supportEmail}`} className="font-semibold underline">
          {SITE.supportEmail}
        </a>
        . Chaque signalement est examiné par notre équipe.
      </Alert>
    </div>
  );
}
