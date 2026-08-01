'use client';

/**
 * Boutons de contact du vendeur.
 *
 * Bonne pratique anti-spam : le numéro n'est pas rendu dans le HTML initial,
 * il n'apparaît qu'après un clic explicite de l'utilisateur.
 */
import { MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { formatGabonPhone, toTelHref, toWhatsAppHref } from '@/utils/phone';

export interface ContactActionsProps {
  phone: string | null;
  whatsapp: string | null;
  listingTitle: string;
  listingUrl: string;
}

export function ContactActions({ phone, whatsapp, listingTitle, listingUrl }: ContactActionsProps) {
  const [revealed, setRevealed] = useState(false);

  const telHref = toTelHref(phone);
  const whatsappHref = toWhatsAppHref(
    whatsapp,
    `Bonjour, je suis intéressé(e) par votre annonce « ${listingTitle} » sur Daghoip Ikassa. ${listingUrl}`,
  );

  if (!telHref && !whatsappHref) return null;

  return (
    <div className="space-y-2">
      {telHref ? (
        revealed ? (
          <a
            href={telHref}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 text-base font-bold text-white transition-colors hover:bg-brand-800"
          >
            <Phone className="size-5" aria-hidden="true" />
            {formatGabonPhone(phone)}
          </a>
        ) : (
          <Button type="button" size="lg" fullWidth onClick={() => setRevealed(true)}>
            <Phone className="size-5" aria-hidden="true" />
            Afficher le numéro
          </Button>
        )
      ) : null}

      {whatsappHref ? (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-base font-bold text-white transition-opacity hover:opacity-90"
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          Contacter sur WhatsApp
        </a>
      ) : null}
    </div>
  );
}
