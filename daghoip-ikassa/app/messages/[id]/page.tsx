import { ArrowLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';

import { Avatar } from '@/components/common/Avatar';
import { ConversationActions } from '@/components/messages/ConversationActions';
import { MessageThread } from '@/components/messages/MessageThread';
import { Alert } from '@/components/ui/Alert';
import { getCurrentUser } from '@/lib/supabase/server';
import {
  getConversation,
  getMessages,
  hasBlocked,
  isBlockedWith,
  isConversationArchived,
} from '@/services/conversations.service';
import { createSignedUrl } from '@/services/storage.service';
import { MESSAGE_ATTACHMENTS_BUCKET } from '@/utils/constants';
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

  const [messages, isArchived, isBlocked, iBlockedThem] = await Promise.all([
    getMessages(parsedId.data),
    isConversationArchived(parsedId.data, user.id),
    isBlockedWith(conversation.correspondentId, user.id),
    hasBlocked(conversation.correspondentId),
  ]);

  // Les pièces jointes vivent dans un bucket privé : le serveur signe celles
  // qui sont déjà là, le navigateur signera lui-même celles qui arriveront.
  const attachmentEntries = await Promise.all(
    messages
      .map((message) => message.attachment_path)
      .filter((path): path is string => Boolean(path))
      .map(
        async (path) => [path, await createSignedUrl(MESSAGE_ATTACHMENTS_BUCKET, path)] as const,
      ),
  );

  const initialAttachmentUrls = Object.fromEntries(
    attachmentEntries.filter((entry): entry is [string, string] => entry[1] !== null),
  );

  /**
   * Message affiché à la place du champ de saisie.
   * Il est **volontairement identique** dans les deux sens : la personne
   * bloquée ne doit pas pouvoir déduire qu'elle l'a été.
   */
  const disabledReason = isBlocked
    ? iBlockedThem
      ? 'Vous avez bloqué cette personne. Débloquez-la pour reprendre la discussion.'
      : 'Cette conversation n’accepte plus de nouveaux messages.'
    : null;

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
      <header className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex gap-3">
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
        </div>

        <div className="mt-3 border-t border-neutral-100 pt-3">
          <ConversationActions
            conversationId={conversation.id}
            correspondentId={conversation.correspondentId}
            correspondentName={conversation.correspondentName}
            isArchived={isArchived}
            isBlocked={iBlockedThem}
          />
        </div>
      </header>

      {isArchived ? (
        <Alert tone="info" className="mt-3">
          Cette conversation est archivée. Elle reviendra dans votre boîte de réception au prochain
          message.
        </Alert>
      ) : null}

      <MessageThread
        conversationId={conversation.id}
        currentUserId={user.id}
        initialMessages={messages}
        initialAttachmentUrls={initialAttachmentUrls}
        correspondentName={conversation.correspondentName}
        disabledReason={disabledReason}
        hasUnread={conversation.unreadCount > 0}
      />
    </div>
  );
}
