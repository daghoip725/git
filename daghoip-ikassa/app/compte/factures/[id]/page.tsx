/**
 * Facture d'un paiement abouti, imprimable.
 *
 * Le contrôle d'accès n'est pas fait ici : `get_invoice()` est `security
 * invoker`, donc la RLS de `payments` s'applique — le payeur voit la sienne, le
 * personnel les voit toutes, un tiers n'obtient aucune ligne et tombe sur un
 * 404. Écrire un filtre supplémentaire donnerait l'illusion que la sécurité est
 * ici, alors qu'elle est en base.
 *
 * La mise en page d'impression est traitée par des classes `print:` plutôt que
 * par une génération de PDF côté serveur : c'est autant de moins à maintenir, et
 * « Enregistrer en PDF » du navigateur produit le même résultat.
 */
import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Logo } from '@/components/common/Logo';
import { PrintButton } from '@/components/payments/PrintButton';
import { getInvoice } from '@/services/billing.service';
import { formatLongDate, formatPrice } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Facture',
  robots: { index: false, follow: false },
};

const PROVIDER_LABELS: Record<string, string> = {
  airtel_money: 'Airtel Money',
  moov_money: 'Moov Money',
  card: 'Carte bancaire',
  bank_transfer: 'Virement ou dépôt',
  cash: 'Espèces',
  manual: 'Saisie manuelle',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InvoicePage({ params }: PageProps) {
  const { id } = await params;
  const invoice = await getInvoice(id);

  if (!invoice) notFound();

  return (
    <div className="space-y-4">
      {/* Barre d'actions : masquée à l'impression, elle n'a pas de sens sur papier. */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link
          href="/compte/paiements"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-800 hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Retour aux paiements
        </Link>

        <PrintButton />
      </div>

      <article className="rounded-xl border border-neutral-200 bg-card p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-6">
          <div>
            {/* `href={null}` : sur une facture imprimée, un lien n'a pas de sens. */}
            <Logo variant="mark" size={44} href={null} />
            <p className="mt-2 text-sm font-semibold text-brand-900">Daghoip Ikassa</p>
            <p className="text-xs text-neutral-500">Petites annonces — Gabon</p>
          </div>

          <div className="text-right">
            <h1 className="text-xl font-extrabold text-brand-900">Facture</h1>
            <p className="mt-1 font-mono text-sm text-neutral-700">
              {invoice.invoice_number ?? '—'}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              Émise le {formatLongDate(invoice.invoiced_at)}
            </p>
          </div>
        </header>

        <section className="grid gap-6 py-6 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              Facturé à
            </h2>
            <p className="mt-1.5 font-semibold text-neutral-900">{invoice.payer_name ?? '—'}</p>
            {invoice.payer_city ? (
              <p className="text-sm text-neutral-600">{invoice.payer_city}, Gabon</p>
            ) : null}
          </div>

          <div className="sm:text-right">
            <h2 className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              Règlement
            </h2>
            <p className="mt-1.5 text-sm text-neutral-700">
              {PROVIDER_LABELS[invoice.provider] ?? invoice.provider}
            </p>
            <p className="text-sm text-neutral-600">Réglée le {formatLongDate(invoice.paid_at)}</p>
            <p className="mt-0.5 font-mono text-xs text-neutral-500">{invoice.reference}</p>
          </div>
        </section>

        <table className="w-full border-t border-neutral-200 text-sm">
          <caption className="sr-only">Détail de la prestation facturée</caption>
          <thead>
            <tr className="text-left text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              <th scope="col" className="py-3">
                Désignation
              </th>
              <th scope="col" className="py-3 text-right">
                Montant
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-neutral-100">
              <td className="py-3 text-neutral-800">{invoice.designation}</td>
              <td className="py-3 text-right font-medium text-neutral-900 tabular-nums">
                {formatPrice(invoice.amount)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-neutral-300">
              <th scope="row" className="py-3 text-left font-bold text-neutral-900">
                Total réglé
              </th>
              <td className="py-3 text-right text-lg font-extrabold text-brand-900 tabular-nums">
                {formatPrice(invoice.amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        <footer className="mt-6 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
          <p>
            Facture acquittée — aucun montant restant dû. Montants exprimés en francs CFA (XAF),
            toutes taxes comprises.
          </p>
          <p className="mt-1">Pour toute réclamation, indiquez la référence {invoice.reference}.</p>
        </footer>
      </article>
    </div>
  );
}
