'use client';

/**
 * Cloche de notifications, alimentée en temps réel.
 *
 * Le serveur rend l'état initial (aucun clignotement à l'hydratation), puis
 * l'abonnement Realtime ajoute les notifications à mesure qu'elles naissent.
 * Elles sont créées par des triggers PostgreSQL — nouveau message, annonce
 * approuvée, paiement confirmé… — jamais par le client, qui n'a aucun droit
 * d'INSERT sur la table.
 *
 * Le filtre `user_id=eq.…` évite d'ouvrir un flux inutile : la RLS ne
 * diffuserait de toute façon que les lignes de l'utilisateur, mais autant ne
 * pas les transporter pour rien.
 */
import { Bell, Check, MessageSquare, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { markNotificationsReadAction } from '@/app/actions/notifications.actions';
import { createClient } from '@/lib/supabase/client';
import type { Notification } from '@/types';
import { cn } from '@/utils/cn';
import { formatRelativeDate } from '@/utils/format';

export interface NotificationBellProps {
  userId: string;
  initialNotifications: Notification[];
  initialUnreadCount: number;
}

/** Nombre de notifications gardées dans le panneau. */
const MAX_SHOWN = 12;

export function NotificationBell({
  userId,
  initialNotifications,
  initialUnreadCount,
}: NotificationBellProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Temps réel -----------------------------------------------------------
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const incoming = payload.new as Notification;
          setNotifications((previous) =>
            previous.some((item) => item.id === incoming.id)
              ? previous
              : [incoming, ...previous].slice(0, MAX_SHOWN),
          );
          setUnreadCount((count) => count + 1);
          // Les badges rendus par le serveur (messages non lus) se remettent
          // à jour du même coup.
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [router, userId]);

  // --- Fermeture au clic extérieur -----------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  function markAllRead() {
    startTransition(async () => {
      const result = await markNotificationsReadAction();
      if (result.success) {
        setUnreadCount(0);
        setNotifications((previous) =>
          previous.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })),
        );
        router.refresh();
      }
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} non lues` : 'Notifications'}
        className="relative rounded-lg p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-brand-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-neutral-200 p-3">
            <h2 className="text-sm font-bold text-brand-900">Notifications</h2>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={isPending}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800 disabled:opacity-50"
              >
                {isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                Tout marquer comme lu
              </button>
            ) : null}
          </div>

          {notifications.length > 0 ? (
            <ul className="max-h-96 divide-y divide-neutral-100 overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    href={notification.link ?? '/compte'}
                    onClick={() => setIsOpen(false)}
                    className={cn(
                      'flex gap-2.5 p-3 transition-colors hover:bg-neutral-50',
                      !notification.read_at && 'bg-brand-50/60',
                    )}
                  >
                    <MessageSquare
                      className="mt-0.5 size-4 shrink-0 text-brand-600"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-neutral-900">
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="line-clamp-2-safe mt-0.5 block text-xs text-neutral-600">
                          {notification.body}
                        </span>
                      ) : null}
                      <time
                        dateTime={notification.created_at}
                        className="mt-1 block text-[11px] text-neutral-400"
                      >
                        {formatRelativeDate(notification.created_at)}
                      </time>
                    </span>
                    {!notification.read_at ? (
                      <span
                        aria-label="Non lue"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-6 text-center text-sm text-neutral-500">
              Aucune notification pour l’instant.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
