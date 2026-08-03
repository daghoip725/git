'use client';

/**
 * Liste des conversations, avec recherche instantanée et bascule d'archives.
 *
 * Le serveur fournit la liste initiale ; la recherche interroge ensuite la RPC
 * `search_conversations` **depuis le navigateur**, comme la recherche
 * d'annonces. Elle porte à la fois sur le contenu des messages, le titre de
 * l'annonce et le nom du correspondant : chercher « Toyota » doit retrouver le
 * fil sur la Toyota, même si le mot n'apparaît dans aucun message.
 *
 * La liste se met aussi à jour en direct : un message reçu remonte la
 * conversation en tête sans rechargement.
 */
import { Archive, Inbox, Loader2, MessageSquare, Search, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { Avatar } from '@/components/common/Avatar';
import { EmptyState } from '@/components/common/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { useDebounce } from '@/hooks/useDebounce';
import { createClient } from '@/lib/supabase/client';
import { getAdImageUrl, getAvatarUrl } from '@/services/storage.service';
import type { ConversationSummary } from '@/types';
import { cn } from '@/utils/cn';
import { formatRelativeDate, truncate } from '@/utils/format';

/** Résultat de recherche : une conversation, plus l'origine de la correspondance. */
interface SearchHit extends ConversationSummary {
  matchExcerpt: string | null;
  matchType: 'message' | 'annonce' | 'correspondant';
}

export interface ConversationListProps {
  currentUserId: string;
  initialConversations: ConversationSummary[];
  /** `true` si la vue courante est celle des archives. */
  showArchived: boolean;
}

const MATCH_LABELS: Record<SearchHit['matchType'], string> = {
  message: 'Trouvé dans les messages',
  annonce: 'Trouvé dans le titre de l’annonce',
  correspondant: 'Trouvé dans le nom du correspondant',
};

export function ConversationList({
  currentUserId,
  initialConversations,
  showArchived,
}: ConversationListProps) {
  const router = useRouter();
  const inputId = useId();
  const [conversations, setConversations] = useState(initialConversations);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const debouncedQuery = useDebounce(query, 300);
  const generation = useRef(0);

  // Le serveur reste la source de vérité de la liste : à chaque navigation, on
  // repart de ce qu'il a rendu.
  useEffect(() => setConversations(initialConversations), [initialConversations]);

  // --- Temps réel -----------------------------------------------------------
  //  Un message reçu doit remonter son fil en tête sans rechargement. Plutôt
  //  que de recalculer l'ordre et les compteurs dans le navigateur — ce qui
  //  reviendrait à réimplémenter la vue SQL —, on redemande la liste au
  //  serveur. L'abonnement n'est pas filtré : la RLS ne diffuse de toute façon
  //  que les messages des conversations de l'utilisateur.
  useEffect(() => {
    const supabase = createClient();
    let timer: number | undefined;

    const channel = supabase
      .channel('conversations-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        // Plusieurs messages en rafale ne déclenchent qu'un seul rafraîchissement.
        window.clearTimeout(timer);
        timer = window.setTimeout(() => router.refresh(), 400);
      })
      .subscribe();

    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  // --- Recherche ------------------------------------------------------------
  useEffect(() => {
    const term = debouncedQuery.trim();
    if (term.length < 2) {
      setHits(null);
      setIsSearching(false);
      return;
    }

    const current = ++generation.current;
    setIsSearching(true);

    void createClient()
      .rpc('search_conversations', { p_query: term })
      .then(({ data, error }) => {
        if (current !== generation.current) return;
        setIsSearching(false);
        if (error) {
          setHits([]);
          return;
        }
        setHits((data ?? []).map((row) => toHit(row, currentUserId)));
      });
  }, [currentUserId, debouncedQuery]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setHits(null);
  }, []);

  const shown: (ConversationSummary | SearchHit)[] = hits ?? conversations;

  return (
    <div>
      {/* ------------------------------ Recherche ------------------------------ */}
      <div className="relative mb-3">
        <label htmlFor={inputId} className="sr-only">
          Rechercher dans les conversations
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4.5 -translate-y-1/2 text-neutral-500"
          aria-hidden="true"
        />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un message, une annonce, une personne…"
          autoComplete="off"
          className="h-11 w-full appearance-none rounded-lg border border-neutral-300 bg-card pr-16 pl-10 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {isSearching ? (
            <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden="true" />
          ) : null}
          {query ? (
            <button
              type="button"
              onClick={clearSearch}
              aria-label="Effacer la recherche"
              className="rounded-full p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* --------------------------- Boîte / archives --------------------------- */}
      {hits === null ? (
        <nav aria-label="Filtrer les conversations" className="mb-4 flex gap-1.5">
          <TabLink
            href="/messages"
            isActive={!showArchived}
            icon={Inbox}
            label="Boîte de réception"
          />
          <TabLink
            href="/messages?vue=archives"
            isActive={showArchived}
            icon={Archive}
            label="Archivées"
          />
        </nav>
      ) : (
        <p className="mb-4 text-sm text-neutral-600" role="status" aria-live="polite">
          {hits.length} résultat{hits.length > 1 ? 's' : ''} pour « {debouncedQuery.trim()} »
        </p>
      )}

      {/* ------------------------------ Résultats ------------------------------ */}
      {shown.length > 0 ? (
        <ul className="space-y-2">
          {shown.map((conversation) => (
            <li key={conversation.id}>
              <ConversationCard conversation={conversation} />
            </li>
          ))}
        </ul>
      ) : hits !== null ? (
        <EmptyState
          icon={Search}
          title="Aucune conversation ne correspond"
          description="Essayez un autre mot : le nom de la personne, le titre de l’annonce, ou un mot échangé dans le fil."
        />
      ) : showArchived ? (
        <EmptyState
          icon={Archive}
          title="Aucune conversation archivée"
          description="Les fils que vous rangez apparaîtront ici. Un nouveau message les en fait ressortir."
          action={<ButtonLink href="/messages">Retour à la boîte de réception</ButtonLink>}
        />
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

/* -------------------------------------------------------------------------- */

interface TabLinkProps {
  href: string;
  isActive: boolean;
  icon: typeof Inbox;
  label: string;
}

function TabLink({ href, isActive, icon: Icon, label }: TabLinkProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors',
        isActive
          ? 'border-brand-800 bg-brand-700 text-white'
          : 'border-neutral-300 text-neutral-700 hover:border-brand-500 hover:text-brand-800',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

function ConversationCard({ conversation }: { conversation: ConversationSummary | SearchHit }) {
  const hit = 'matchType' in conversation ? conversation : null;

  return (
    <Link
      href={`/messages/${conversation.id}`}
      className="flex gap-3 rounded-xl border border-neutral-200 bg-card p-3 transition-colors hover:border-brand-300"
    >
      <span className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
        {conversation.adImageUrl ? (
          <Image src={conversation.adImageUrl} alt="" fill sizes="56px" className="object-cover" />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <Avatar
              name={conversation.correspondentName}
              src={conversation.correspondentAvatarUrl}
              size={20}
            />
            <span className="truncate font-semibold text-brand-900">
              {conversation.correspondentName}
            </span>
          </span>
          {conversation.lastMessageAt ? (
            <time
              dateTime={conversation.lastMessageAt}
              className="shrink-0 text-xs text-neutral-500"
            >
              {formatRelativeDate(conversation.lastMessageAt)}
            </time>
          ) : null}
        </span>

        <span className="mt-0.5 block truncate text-xs text-neutral-500">
          {conversation.isSeller ? 'Sur votre annonce · ' : ''}
          {conversation.adTitle}
        </span>

        <span className="mt-1 block text-sm text-neutral-700">
          {hit?.matchExcerpt
            ? truncate(hit.matchExcerpt, 90)
            : conversation.lastMessage
              ? truncate(conversation.lastMessage, 90)
              : 'Aucun message'}
        </span>

        {hit ? (
          <span className="mt-1 block text-[11px] text-neutral-500">
            {MATCH_LABELS[hit.matchType]}
          </span>
        ) : null}
      </span>

      {conversation.unreadCount > 0 ? (
        <span className="flex size-6 shrink-0 items-center justify-center self-center rounded-full bg-brand-700 text-xs font-bold text-white">
          {conversation.unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

/** Transforme une ligne de `search_conversations` selon le point de vue courant. */
function toHit(
  row: {
    id: string;
    ad_id: string;
    ad_title: string;
    ad_slug: string;
    ad_reference: string;
    ad_cover_image_path: string | null;
    buyer_id: string;
    buyer_name: string;
    buyer_avatar_path: string | null;
    seller_id: string;
    seller_name: string;
    seller_avatar_path: string | null;
    last_message_at: string | null;
    last_message_preview: string | null;
    buyer_unread_count: number;
    seller_unread_count: number;
    match_excerpt: string | null;
    match_type: SearchHit['matchType'];
  },
  userId: string,
): SearchHit {
  const isSeller = row.seller_id === userId;

  return {
    id: row.id,
    adId: row.ad_id,
    adTitle: row.ad_title,
    adSlug: row.ad_slug,
    adReference: row.ad_reference,
    adImageUrl: getAdImageUrl(row.ad_cover_image_path),
    correspondentId: isSeller ? row.buyer_id : row.seller_id,
    correspondentName: isSeller ? row.buyer_name : row.seller_name,
    correspondentAvatarUrl: getAvatarUrl(isSeller ? row.buyer_avatar_path : row.seller_avatar_path),
    lastMessage: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    unreadCount: isSeller ? row.seller_unread_count : row.buyer_unread_count,
    isSeller,
    matchExcerpt: row.match_excerpt,
    matchType: row.match_type,
  };
}
