import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { markConversationReadAction } from '@/app/actions/conversations.actions';
import { MessageComposer } from '@/components/messages/MessageComposer';
import { Avatar } from '@/components/common/Avatar';
import { getCurrentUser } from '@/lib/supabase/server';
import { getConversation, getMessages } from '@/services/conversations.service';
import { cn } from '@/utils/cn';
import { formatDateTime } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

export const metadata: Metadata = {
  title: 'Conversation',
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;

  const parsedId = z.string().uuid().safeParse(id);
  if (!parsedId.success) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=/messages/${id}`);

  // La RLS filtre déjà : un fil dont l'utilisateur n'est pas participant
  // ressort comme introuvable.
  const conversation = await getConversation(parsedId.data, user.id);
  if (!conversation) notFound();

  const messages = await getMessages(parsedId.data);

  // Accusé de lecture à l'ouverture du fil.
  if (conversation.unreadCount > 0) {
    await markConversationReadAction(parsedId.data);
  }

  return (
    <div className="container-app flex max-w-3xl flex-col py-6 sm:py-10">
      <Link
        href="/messages"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-brand-700"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Toutes les conversations
      </Link>

      {/* ---------------------------- En-tête du fil ---------------------------- */}
      <header className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <Link
          href={buildListingHref(conversation.adSlug, conversation.adReference)}
          className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100"
        >
          {conversation.adImageUrl ? (
            <Image
              src={conversation.adImageUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : null}
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={buildListingHref(conversation.adSlug, conversation.adReference)}
            className="line-clamp-2-safe font-semibold text-brand-900 hover:text-brand-700"
          >
            {conversation.adTitle}
          </Link>
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-600">
            <Avatar
              name={conversation.correspondentName}
              src={conversation.correspondentAvatarUrl}
              size={22}
            />
            {conversation.correspondentName}
          </p>
        </div>
      </header>

      {/* ------------------------------ Messages ------------------------------ */}
      <ol className="my-5 flex flex-col gap-3">
        {messages.map((message) => {
          const isMine = message.sender_id === user.id;

          return (
            <li
              key={message.id}
              className={cn(
                'flex max-w-[85%] flex-col',
                isMine ? 'items-end self-end' : 'self-start',
              )}
            >
              <div
                className={cn(
                  'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  isMine
                    ? 'rounded-br-sm bg-brand-700 text-white'
                    : 'rounded-bl-sm border border-neutral-200 bg-white text-neutral-800',
                )}
              >
                {/* Rendu en texte brut : aucun HTML utilisateur n'est interprété. */}
                <p className="whitespace-pre-line">{message.body}</p>
              </div>
              <time
                dateTime={message.created_at}
                className="mt-1 px-1 text-[11px] text-neutral-400"
              >
                {formatDateTime(message.created_at)}
                {isMine && message.read_at ? ' · Lu' : ''}
              </time>
            </li>
          );
        })}
      </ol>

      <MessageComposer conversationId={conversation.id} />
    </div>
  );
}
