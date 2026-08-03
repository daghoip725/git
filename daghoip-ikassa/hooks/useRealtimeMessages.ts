'use client';

/**
 * Fil de discussion en temps réel.
 *
 * Les messages du serveur servent de point de départ ; PostgreSQL diffuse
 * ensuite les changements via Supabase Realtime. La RLS s'applique aussi à la
 * diffusion : un abonné ne reçoit que les lignes qu'il aurait le droit de lire.
 *
 * Deux événements sont écoutés sur `messages`, filtrés sur la conversation :
 *  - `INSERT` : un message arrive (du correspondant, ou d'un autre onglet) ;
 *  - `UPDATE` : `read_at` vient d'être posé — c'est l'accusé de lecture, qui
 *    apparaît donc chez l'expéditeur sans qu'il recharge quoi que ce soit.
 *
 * L'envoi reste optimiste : le message s'affiche immédiatement avec un
 * identifiant provisoire, puis la ligne réelle le remplace à son retour. Sans
 * cela, l'expéditeur attendrait l'aller-retour serveur pour voir son propre
 * message — l'inverse de ce qu'on attend d'une messagerie.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import type { Message } from '@/types';

/** Message en cours d'envoi, pas encore confirmé par la base. */
export interface PendingMessage extends Message {
  /** `true` tant que la base n'a pas confirmé l'écriture. */
  isPending: true;
  /** Aperçu local de la photo, avant que l'URL signée soit disponible. */
  localPreviewUrl?: string;
}

export type ThreadMessage = Message | PendingMessage;

export function isPending(message: ThreadMessage): message is PendingMessage {
  return 'isPending' in message;
}

export interface UseRealtimeMessagesOptions {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
}

export interface UseRealtimeMessagesResult {
  messages: ThreadMessage[];
  /** `true` une fois l'abonnement temps réel établi. */
  isLive: boolean;
  /** Ajoute un message optimiste et renvoie sa clé provisoire. */
  addPending: (message: Omit<PendingMessage, 'isPending'>) => string;
  /** Retire un message optimiste dont l'envoi a échoué. */
  dropPending: (key: string) => void;
}

export function useRealtimeMessages({
  conversationId,
  currentUserId,
  initialMessages,
}: UseRealtimeMessagesOptions): UseRealtimeMessagesResult {
  const [messages, setMessages] = useState<ThreadMessage[]>(initialMessages);
  const [isLive, setIsLive] = useState(false);

  /** Corps des messages envoyés localement, pour reconnaître leur écho. */
  const pendingBodies = useRef(new Map<string, string>());

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as Message;

          setMessages((previous) => {
            // Déjà présent (deux onglets, ou réémission) : on ne double pas.
            if (previous.some((message) => message.id === incoming.id)) return previous;

            // Écho de notre propre envoi optimiste : on remplace au lieu d'ajouter.
            if (incoming.sender_id === currentUserId) {
              const key = [...pendingBodies.current.entries()].find(
                ([, body]) => body === incoming.body,
              )?.[0];

              if (key) {
                pendingBodies.current.delete(key);
                return previous.map((message) => (message.id === key ? incoming : message));
              }
            }

            return [...previous, incoming];
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as Message;
          setMessages((previous) =>
            previous.map((message) => (message.id === updated.id ? updated : message)),
          );
        },
      )
      .subscribe((status) => setIsLive(status === 'SUBSCRIBED'));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  const addPending = useCallback((message: Omit<PendingMessage, 'isPending'>) => {
    const key = message.id;
    pendingBodies.current.set(key, message.body);
    setMessages((previous) => [...previous, { ...message, isPending: true }]);
    return key;
  }, []);

  const dropPending = useCallback((key: string) => {
    pendingBodies.current.delete(key);
    setMessages((previous) => previous.filter((message) => message.id !== key));
  }, []);

  return { messages, isLive, addPending, dropPending };
}
