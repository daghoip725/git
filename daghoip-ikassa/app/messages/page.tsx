import { MessageSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { EmptyState } from '@/components/common/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { getCurrentUser } from '@/lib/supabase/server';
import { getConversations } from '@/services/messages.service';
import { formatRelativeDate, truncate } from '@/utils/format';
import { buildListingHref } from '@/utils/slug';

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
};

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/messages');

  const conversations = await getConversations(user.id);

  return (
    <div className="container-app max-w-3xl py-6 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold text-brand-900">Messages</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {conversations.length} conversation{conversations.length > 1 ? 's' : ''}.
        </p>
      </header>

      {conversations.length > 0 ? (
        <ul className="space-y-2">
          {conversations.map((conversation) => (
            <li key={`${conversation.listingId}:${conversation.correspondentId}`}>
              <Link
                href={buildListingHref(conversation.listingSlug, conversation.listingReference)}
                className="flex gap-3 rounded-xl border border-neutral-200 bg-white p-3 transition-colors hover:border-brand-300"
              >
                <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
                  {conversation.listingImageUrl ? (
                    <Image
                      src={conversation.listingImageUrl}
                      alt=""
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-brand-900">
                      {conversation.correspondentName}
                    </span>
                    <time
                      dateTime={conversation.lastMessageAt}
                      className="shrink-0 text-xs text-neutral-400"
                    >
                      {formatRelativeDate(conversation.lastMessageAt)}
                    </time>
                  </span>

                  <span className="mt-0.5 block truncate text-xs text-neutral-500">
                    {conversation.listingTitle}
                  </span>

                  <span className="mt-1 block text-sm text-neutral-700">
                    {truncate(conversation.lastMessage, 90)}
                  </span>
                </span>

                {conversation.unreadCount > 0 ? (
                  <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-full bg-brand-700 text-xs font-bold text-white">
                    {conversation.unreadCount}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={MessageSquare}
          title="Aucun message pour l’instant"
          description="Les messages des acheteurs intéressés par vos annonces apparaîtront ici."
          action={<ButtonLink href="/annonces">Parcourir les annonces</ButtonLink>}
        />
      )}
    </div>
  );
}
