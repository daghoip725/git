'use client';

/** Champ de saisie d'un message dans un fil existant. */
import { Send } from 'lucide-react';
import { useActionState, useEffect, useRef } from 'react';

import { sendMessageAction } from '@/app/actions/conversations.actions';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import type { ActionResult } from '@/types';

export interface MessageComposerProps {
  conversationId: string;
}

export function MessageComposer({ conversationId }: MessageComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState<ActionResult<null> | null, FormData>(
    sendMessageAction,
    null,
  );

  // Vide le champ après un envoi réussi.
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="sticky bottom-0 space-y-2 border-t border-neutral-200 bg-white/95 py-3 backdrop-blur"
    >
      <input type="hidden" name="conversationId" value={conversationId} />

      <div className="flex items-end gap-2">
        <label htmlFor="message-body" className="sr-only">
          Votre message
        </label>
        <textarea
          id="message-body"
          name="body"
          rows={2}
          required
          maxLength={2000}
          placeholder="Écrivez votre message…"
          className="min-h-11 flex-1 resize-y rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none"
        />
        <Button type="submit" isLoading={isPending} aria-label="Envoyer">
          <Send className="size-4.5" aria-hidden="true" />
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </div>

      {state?.success === false ? <Alert tone="error">{state.error}</Alert> : null}

      <p className="text-xs text-neutral-500">
        Ne communiquez jamais de code Mobile Money par messagerie.
      </p>
    </form>
  );
}
