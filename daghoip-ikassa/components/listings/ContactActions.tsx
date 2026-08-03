'use client';

/**
 * Boutons de contact du vendeur.
 *
 * Bonne pratique anti-spam : le numéro n'est pas rendu dans le HTML initial,
 * il n'apparaît qu'après un clic explicite de l'utilisateur.
 *
 * Chaque geste compte aussi comme un **contact** pour le vendeur. La mesure est
 * volontairement placée sur le clic et non sur l'affichage de la page : une
 * annonce vue mille fois et jamais contactée est un signal, et confondre les
 * deux le ferait disparaître. Le comptage est asynchrone et sans attente — un
 * appel qui échoue ne doit jamais retarder l'ouverture de WhatsApp ni
 * l'affichage du numéro.
 */
import { MessageCircle, Phone } from 'lucide-react';
import { useState } from 'react';

import { recordAdContactAction } from '@/app/actions/stats.actions';
import { Button } from '@/components/ui/Button';
import { useVisitorId } from '@/hooks/useVisitorId';
import type { ContactChannel } from '@/types/database';
import { formatGabonPhone, toTelHref, toWhatsAppHref } from '@/utils/phone';

export interface ContactActionsProps {
  /** Identifiant de l'annonce, pour la mesure d'audience. */
  listingId: string;
  phone: string | null;
  whatsapp: string | null;
  listingTitle: string;
  listingUrl: string;
}

export function ContactActions({
  listingId,
  phone,
  whatsapp,
  listingTitle,
  listingUrl,
}: ContactActionsProps) {
  const [revealed, setRevealed] = useState(false);
  const visitorId = useVisitorId();

  const telHref = toTelHref(phone);
  const whatsappHref = toWhatsAppHref(
    whatsapp,
    `Bonjour, je suis intéressé(e) par votre annonce « ${listingTitle} » sur Daghoip Ikassa. ${listingUrl}`,
  );

  /*
   * Ni `await` ni `void` sur une promesse rejetée : l'action ne lève pas, mais
   * une erreur réseau du transport, elle, le peut. On l'absorbe explicitement
   * pour ne pas laisser une promesse non gérée derrière un clic.
   */
  const countContact = (channel: ContactChannel) => {
    recordAdContactAction({ adId: listingId, channel, visitor: visitorId }).catch(() => {});
  };

  if (!telHref && !whatsappHref) return null;

  return (
    <div className="space-y-2">
      {telHref ? (
        revealed ? (
          <a
            href={telHref}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 text-base font-bold text-white transition-colors hover:bg-brand-ink"
          >
            <Phone className="size-5" aria-hidden="true" />
            {formatGabonPhone(phone)}
          </a>
        ) : (
          <Button
            type="button"
            size="lg"
            fullWidth
            onClick={() => {
              setRevealed(true);
              countContact('phone');
            }}
          >
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
          onClick={() => countContact('whatsapp')}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] text-base font-bold text-white transition-opacity hover:opacity-90"
        >
          <MessageCircle className="size-5" aria-hidden="true" />
          Contacter sur WhatsApp
        </a>
      ) : null}
    </div>
  );
}
