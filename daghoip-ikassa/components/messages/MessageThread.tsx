'use client';

/**
 * Fil de discussion temps réel.
 *
 * Assemble l'abonnement Realtime, l'affichage des bulles, les accusés de
 * lecture et la saisie. Trois comportements méritent une note :
 *
 *  - **le fil descend tout seul** à l'arrivée d'un message, mais seulement si
 *    l'utilisateur était déjà en bas. Sinon il est en train de relire d'anciens
 *    messages, et le lui arracher serait pénible ;
 *  - **les messages reçus sont marqués lus** quand la fenêtre est réellement
 *    visible, pas au simple rendu : un onglet ouvert en arrière-plan ne signifie
 *    pas que le message a été lu ;
 *  - **les photos** viennent d'un bucket privé. Le serveur fournit les URL
 *    signées des messages initiaux ; celles des messages arrivant en direct
 *    sont demandées par le navigateur, qui a lui aussi le droit de les lire.
 */
import { Check, CheckCheck, Loader2, Radio } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MessageComposer } from '@/components/messages/MessageComposer';
import { createClient } from '@/lib/supabase/client';
import { isPending, useRealtimeMessages, type ThreadMessage } from '@/hooks/useRealtimeMessages';
import { signMessageAttachment } from '@/services/storage.service';
import type { Message } from '@/types';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';

export interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  /** URL signées des pièces jointes déjà présentes, par chemin Storage. */
  initialAttachmentUrls: Record<string, string>;
  correspondentName: string;
  /** Fil clos par un blocage : la saisie est remplacée par l'explication. */
  disabledReason?: string | null;
  /** Des messages reçus attendent d'être marqués lus. */
  hasUnread: boolean;
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  initialAttachmentUrls,
  correspondentName,
  disabledReason,
  hasUnread,
}: MessageThreadProps) {
  const { messages, isLive, addPending, dropPending } = useRealtimeMessages({
    conversationId,
    currentUserId,
    initialMessages,
  });

  const [attachmentUrls, setAttachmentUrls] =
    useState<Record<string, string>>(initialAttachmentUrls);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLOListElement>(null);
  const wasAtBottom = useRef(true);

  // --- Défilement ------------------------------------------------------------
  const trackScroll = useCallback(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const distanceFromBottom =
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
    wasAtBottom.current = distanceFromBottom < 160;
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', trackScroll, { passive: true });
    return () => window.removeEventListener('scroll', trackScroll);
  }, [trackScroll]);

  useEffect(() => {
    if (wasAtBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // --- Accusés de lecture ----------------------------------------------------
  const markRead = useCallback(() => {
    if (document.visibilityState !== 'visible') return;
    // `.then()` n'est pas décoratif : le constructeur de requête PostgREST est
    // paresseux, il n'envoie rien tant qu'on ne l'attend pas. Un `void` seul
    // laisserait l'accusé de lecture non transmis, sans la moindre erreur.
    void createClient()
      .rpc('mark_conversation_read', { p_conversation_id: conversationId })
      .then(() => undefined);
  }, [conversationId]);

  useEffect(() => {
    // À l'ouverture si la page est déjà visible, puis à chaque retour d'onglet.
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [markRead]);

  // Un message reçu pendant que le fil est ouvert est lu immédiatement.
  const lastIncomingId = [...messages]
    .reverse()
    .find((message) => message.sender_id !== currentUserId)?.id;

  useEffect(() => {
    if (lastIncomingId) markRead();
  }, [lastIncomingId, markRead]);

  // --- Pièces jointes arrivées en direct ------------------------------------
  useEffect(() => {
    const missing = messages
      .map((message) => message.attachment_path)
      .filter((path): path is string => Boolean(path) && !(path! in attachmentUrls));

    if (missing.length === 0) return;

    let cancelled = false;
    void Promise.all(
      missing.map(async (path) => [path, await signMessageAttachment(path)] as const),
    ).then((entries) => {
      if (cancelled) return;
      setAttachmentUrls((previous) => {
        const next = { ...previous };
        for (const [path, url] of entries) if (url) next[path] = url;
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [attachmentUrls, messages]);

  return (
    <>
      <ol ref={scrollerRef} className="my-5 flex flex-col gap-3">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={message.sender_id === currentUserId}
            attachmentUrl={
              message.attachment_path ? attachmentUrls[message.attachment_path] : undefined
            }
            correspondentName={correspondentName}
          />
        ))}
        <div ref={bottomRef} />
      </ol>

      {isLive ? (
        <p className="mb-2 flex items-center justify-center gap-1.5 text-xs text-neutral-400">
          <Radio className="size-3.5" aria-hidden="true" />
          Les nouveaux messages arrivent en direct.
        </p>
      ) : null}

      <MessageComposer
        conversationId={conversationId}
        currentUserId={currentUserId}
        disabledReason={disabledReason}
        onOptimisticSend={({ body, localPreviewUrl }) =>
          addPending({
            // Identifiant provisoire : remplacé par la ligne réelle à son retour.
            id: `optimiste-${crypto.randomUUID()}`,
            conversation_id: conversationId,
            sender_id: currentUserId,
            body,
            attachment_path: null,
            read_at: null,
            created_at: new Date().toISOString(),
            localPreviewUrl,
          })
        }
        onSendFailed={dropPending}
      />

      {hasUnread ? <span className="sr-only">Messages marqués comme lus.</span> : null}
    </>
  );
}

interface MessageBubbleProps {
  message: ThreadMessage;
  isMine: boolean;
  attachmentUrl?: string;
  correspondentName: string;
}

function MessageBubble({ message, isMine, attachmentUrl, correspondentName }: MessageBubbleProps) {
  const pending = isPending(message);
  const previewUrl = pending ? message.localPreviewUrl : undefined;
  const imageUrl = attachmentUrl ?? previewUrl;

  return (
    <li className={cn('flex max-w-[85%] flex-col', isMine ? 'items-end self-end' : 'self-start')}>
      <div
        className={cn(
          'overflow-hidden rounded-2xl text-sm leading-relaxed',
          isMine
            ? 'rounded-br-sm bg-brand-700 text-white'
            : 'rounded-bl-sm border border-neutral-200 bg-white text-neutral-800',
          pending && 'opacity-70',
        )}
      >
        {message.attachment_path || previewUrl ? (
          imageUrl ? (
            <Image
              src={imageUrl}
              alt={
                isMine ? 'Photo que vous avez envoyée' : `Photo envoyée par ${correspondentName}`
              }
              width={320}
              height={240}
              unoptimized
              className="max-h-72 w-full object-cover"
            />
          ) : (
            <div className="flex h-32 w-56 items-center justify-center bg-neutral-100 text-neutral-400">
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              <span className="sr-only">Chargement de la photo</span>
            </div>
          )
        ) : null}

        {message.body ? (
          // Rendu en texte brut : aucun HTML utilisateur n'est interprété.
          <p className="px-4 py-2.5 whitespace-pre-line">{message.body}</p>
        ) : null}
      </div>

      <span className="mt-1 flex flex-wrap items-center justify-end gap-x-1 px-1 text-[11px] text-neutral-400">
        <time dateTime={message.created_at}>{formatDateTime(message.created_at)}</time>
        {isMine && !pending ? (
          message.read_at ? (
            <>
              <CheckCheck className="size-3.5 text-brand-600" aria-hidden="true" />
              <span className="sr-only">Lu</span>
            </>
          ) : (
            <>
              <Check className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Envoyé</span>
            </>
          )
        ) : null}
        {pending ? <span>Envoi…</span> : null}
      </span>
    </li>
  );
}
