import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ConversationList } from '@/components/messages/ConversationList';
import { getCurrentUser } from '@/lib/supabase/server';
import { getConversations } from '@/services/conversations.service';

export const metadata: Metadata = {
  title: 'Messages',
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MessagesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/connexion?next=/messages');

  const params = await searchParams;
  const showArchived = params.vue === 'archives';

  const conversations = await getConversations(user.id, { archived: showArchived });
  const unreadTotal = conversations.reduce((sum, item) => sum + item.unreadCount, 0);

  return (
    <div className="container-app max-w-3xl py-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-brand-900">Messages</h1>
          <p className="mt-1 text-sm text-neutral-600">
            {conversations.length} conversation{conversations.length > 1 ? 's' : ''}
            {showArchived ? ' archivée' : ''}
            {showArchived && conversations.length > 1 ? 's' : ''}
            {unreadTotal > 0 ? `, dont ${unreadTotal} non lu${unreadTotal > 1 ? 's' : ''}` : ''}.
          </p>
        </div>

        <Link
          href="/compte/blocages"
          className="text-sm font-semibold text-brand-800 underline underline-offset-2 hover:text-brand-800"
        >
          Comptes bloqués
        </Link>
      </header>

      <ConversationList
        currentUserId={user.id}
        initialConversations={conversations}
        showArchived={showArchived}
      />
    </div>
  );
}
