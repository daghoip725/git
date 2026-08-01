import { Mail, MapPin, MessageSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { SITE } from '@/utils/constants';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contactez l’équipe Daghoip Ikassa pour toute question, suggestion ou signalement.',
};

export default function ContactPage() {
  return (
    <div className="container-app max-w-2xl py-8 sm:py-12">
      <h1 className="text-2xl font-extrabold text-brand-900 sm:text-3xl">Nous contacter</h1>
      <p className="mt-2 text-neutral-600">
        Une question, une suggestion, un problème avec une annonce ? Notre équipe vous répond.
      </p>

      <div className="mt-8 space-y-3">
        <a
          href={`mailto:${SITE.supportEmail}`}
          className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-300"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <Mail className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-bold text-brand-900">Par e-mail</span>
            <span className="text-sm text-neutral-600">{SITE.supportEmail}</span>
          </span>
        </a>

        <div className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <MapPin className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-bold text-brand-900">Adresse</span>
            <span className="text-sm text-neutral-600">Libreville, Gabon</span>
          </span>
        </div>

        <Link
          href="/securite"
          className="flex items-start gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-brand-300"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
            <MessageSquare className="size-5" aria-hidden="true" />
          </span>
          <span>
            <span className="block font-bold text-brand-900">Signaler une annonce</span>
            <span className="text-sm text-neutral-600">
              Consultez d’abord nos conseils de sécurité.
            </span>
          </span>
        </Link>
      </div>
    </div>
  );
}
