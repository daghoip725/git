'use client';

/**
 * Premier message adressé au vendeur depuis la page d'annonce.
 *
 * La Server Action ouvre (ou retrouve) le fil et y poste le message en une
 * seule opération ; l'acheteur est ensuite emmené dans sa messagerie.
 *
 * Trois questions toutes faites couvrent l'essentiel des premiers contacts :
 * elles évitent la page blanche, qui reste la première cause d'abandon d'un
 * formulaire de contact.
 */
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useState } from 'react';

import { startConversationAction } from '@/app/actions/conversations.actions';
import { Alert } from '@/components/ui/Alert';
import { Button, ButtonLink } from '@/components/ui/Button';
import type { ActionResult } from '@/types';

export interface MessageSellerFormProps {
  listingId: string;
  listingTitle: string;
  isAuthenticated: boolean;
  /** Où revenir après connexion, si l'acheteur n'est pas encore identifié. */
  returnTo: string;
}

const SUGGESTIONS = [
  'Bonjour, cet article est-il toujours disponible ?',
  'Bonjour, quel est votre dernier prix ?',
  'Bonjour, où puis-je venir le voir ?',
];

export function MessageSellerForm({
  listingId,
  listingTitle,
  isAuthenticated,
  returnTo,
}: MessageSellerFormProps) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [state, formAction, isPending] = useActionState<
    ActionResult<{ conversationId: string }> | null,
    FormData
  >(startConversationAction, null);

  useEffect(() => {
    if (state?.success) router.push(`/messages/${state.data.conversationId}`);
  }, [router, state]);

  if (!isAuthenticated) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-neutral-600">
          Connectez-vous pour écrire au vendeur sans révéler votre numéro.
        </p>
        <ButtonLink href={`/connexion?next=${encodeURIComponent(returnTo)}`} variant="outline">
          Se connecter pour envoyer un message
        </ButtonLink>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="adId" value={listingId} />

      <label htmlFor="first-message" className="sr-only">
        Votre message à propos de « {listingTitle} »
      </label>
      <textarea
        id="first-message"
        name="body"
        rows={3}
        required
        maxLength={2000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Bonjour, cet article est-il toujours disponible ?"
        className="w-full resize-y rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
      />

      <ul className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              onClick={() => setBody(suggestion)}
              className="rounded-full border border-neutral-300 px-2.5 py-1 text-xs text-neutral-600 transition-colors hover:border-brand-500 hover:text-brand-800"
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <Button type="submit" fullWidth isLoading={isPending}>
        <Send className="size-4.5" aria-hidden="true" />
        Envoyer le message
      </Button>
    </form>
  );
}
