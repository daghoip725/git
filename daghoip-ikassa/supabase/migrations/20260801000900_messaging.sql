-- =============================================================================
--  Daghoip Ikassa — 09. Messagerie : blocage, pièces jointes, recherche, temps réel
-- =============================================================================
--  Complète la messagerie existante (fils, compteurs de non-lus, accusés de
--  lecture, notifications) avec ce qui lui manquait : blocage d'un
--  correspondant, envoi de photos, recherche dans les conversations, et
--  diffusion temps réel.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. BLOCAGE
-- =============================================================================
--  Un blocage est **unilatéral et discret** : la personne bloquée ne doit pas
--  pouvoir le constater autrement qu'en ne recevant plus de réponse. La RLS ne
--  laisse donc lire à chacun que **ses propres** blocages ; savoir si un
--  blocage existe entre deux comptes passe par une fonction SECURITY DEFINER,
--  qui ne répond que par oui ou non.
-- -----------------------------------------------------------------------------
create table if not exists public.blocked_users (
  blocker_id uuid not null references public.users (id) on delete cascade,
  blocked_id uuid not null references public.users (id) on delete cascade,
  reason     text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),

  primary key (blocker_id, blocked_id),
  constraint blocked_users_distinct check (blocker_id <> blocked_id)
);

comment on table public.blocked_users is
  'Blocages entre comptes. Unilatéral : chacun ne voit que les siens.';

create index if not exists blocked_users_blocked_idx on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;

drop policy if exists blocked_users_select_own on public.blocked_users;
create policy blocked_users_select_own
  on public.blocked_users for select
  to authenticated
  using (blocker_id = auth.uid());

drop policy if exists blocked_users_insert_own on public.blocked_users;
create policy blocked_users_insert_own
  on public.blocked_users for insert
  to authenticated
  with check (blocker_id = auth.uid() and public.is_active_account());

drop policy if exists blocked_users_update_own on public.blocked_users;
create policy blocked_users_update_own
  on public.blocked_users for update
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

drop policy if exists blocked_users_delete_own on public.blocked_users;
create policy blocked_users_delete_own
  on public.blocked_users for delete
  to authenticated
  using (blocker_id = auth.uid());

revoke all on public.blocked_users from anon, authenticated;
grant select, delete on public.blocked_users to authenticated;
--  `blocker_id` est accordé en écriture sans risque : la politique RLS le
--  cloue à `auth.uid()`, on ne peut donc pas bloquer au nom de quelqu'un
--  d'autre. Seul le motif est modifiable ensuite.
grant insert (blocker_id, blocked_id, reason) on public.blocked_users to authenticated;
grant update (reason) on public.blocked_users to authenticated;

/**
 * Un blocage existe-t-il **dans un sens ou dans l'autre** ?
 *
 * SECURITY DEFINER par nécessité : la RLS masque à chacun les blocages dont il
 * est la cible, ce qui est le comportement voulu. La fonction ne divulgue rien
 * de plus qu'un booléen — jamais qui a bloqué qui.
 */
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_users b
     where (b.blocker_id = p_a and b.blocked_id = p_b)
        or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

/** Bloque un compte et archive le fil correspondant, s'il existe. */
create or replace function public.block_user(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if p_user_id = v_user then
    raise exception 'Vous ne pouvez pas vous bloquer vous-même.' using errcode = 'P0001';
  end if;

  insert into public.blocked_users (blocker_id, blocked_id, reason)
  values (v_user, p_user_id, nullif(btrim(coalesce(p_reason, '')), ''))
  on conflict (blocker_id, blocked_id) do update set reason = excluded.reason;

  -- Bloquer sans ranger la conversation laisserait le fil en tête de liste.
  update public.conversations
     set buyer_archived  = case when buyer_id  = v_user then true else buyer_archived  end,
         seller_archived = case when seller_id = v_user then true else seller_archived end
   where (buyer_id = v_user and seller_id = p_user_id)
      or (seller_id = v_user and buyer_id = p_user_id);
end;
$$;

create or replace function public.unblock_user(p_user_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  delete from public.blocked_users
   where blocker_id = auth.uid() and blocked_id = p_user_id;
$$;

/** Comptes bloqués par l'appelant, avec de quoi les identifier. */
create or replace function public.list_blocked_users()
returns table (
  user_id     uuid,
  full_name   text,
  avatar_path text,
  reason      text,
  created_at  timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select u.id, u.full_name, u.avatar_path, b.reason, b.created_at
    from public.blocked_users b
    join public.users u on u.id = b.blocked_id
   where b.blocker_id = auth.uid()
   order by b.created_at desc;
$$;

-- =============================================================================
-- 2. MESSAGES : PHOTOS ET RECHERCHE
-- =============================================================================
--  Un message peut désormais ne porter qu'une photo. La contrainte d'origine
--  imposait au moins un caractère de texte ; on la remplace par « du texte OU
--  une pièce jointe », ce qui reste une garantie contre le message vide.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages drop constraint if exists messages_content_present;
alter table public.messages
  add constraint messages_content_present check (
    char_length(coalesce(body, '')) <= 2000
    and (char_length(btrim(coalesce(body, ''))) > 0 or attachment_path is not null)
  );

--  Colonne de recherche plein texte, maintenue par PostgreSQL lui-même : une
--  colonne générée ne peut pas se désynchroniser, contrairement à un trigger
--  qu'on oublierait de rejouer après une correction de données.
alter table public.messages
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('french', public.immutable_unaccent(coalesce(body, '')))
  ) stored;

create index if not exists messages_search_idx
  on public.messages using gin (search_vector);

--  Nécessaire pour que les événements UPDATE diffusés en temps réel (accusés
--  de lecture) portent l'intégralité de la ligne, et non la seule clé primaire.
alter table public.messages replica identity full;

-- =============================================================================
-- 3. GARDE-FOU À L'INSERTION D'UN MESSAGE
-- =============================================================================
--  Le contrôle vit dans un trigger, et non dans `send_message()` : la RLS
--  autorise aussi l'insertion directe dans `messages`, et un blocage
--  contournable en appelant l'API sans passer par la RPC n'en serait pas un.
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.conversations;
  v_other        uuid;
begin
  select * into v_conversation
    from public.conversations where id = new.conversation_id;

  if v_conversation.id is null then
    raise exception 'Conversation introuvable.' using errcode = 'P0001';
  end if;

  v_other := case
    when new.sender_id = v_conversation.buyer_id then v_conversation.seller_id
    else v_conversation.buyer_id
  end;

  -- Message volontairement neutre : il ne dit pas qui a bloqué qui, et se
  -- lit de la même façon dans les deux sens.
  if public.is_blocked_between(new.sender_id, v_other) then
    raise exception 'Cette conversation n''accepte plus de nouveaux messages.'
      using errcode = 'P0001';
  end if;

  -- Une pièce jointe doit vivre dans le dossier de son auteur, et dans celui
  -- de cette conversation : `<sender_id>/<conversation_id>/<fichier>`.
  if new.attachment_path is not null then
    if new.attachment_path not like new.sender_id::text || '/' || new.conversation_id::text || '/%'
    then
      raise exception 'Pièce jointe invalide.' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- =============================================================================
-- 4. ENVOI D'UN MESSAGE (avec pièce jointe)
-- =============================================================================
drop function if exists public.send_message(uuid, text);

create or replace function public.send_message(
  p_conversation_id uuid,
  p_body            text,
  p_attachment_path text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  insert into public.messages (conversation_id, sender_id, body, attachment_path)
  values (
    p_conversation_id,
    auth.uid(),
    btrim(coalesce(p_body, '')),
    nullif(btrim(coalesce(p_attachment_path, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- =============================================================================
-- 5. OUVERTURE D'UN FIL : REFUS SI BLOCAGE
-- =============================================================================
--  Le trigger d'insertion protège déjà les messages ; refuser dès l'ouverture
--  du fil évite surtout de créer une conversation vide qui ne servira jamais.
create or replace function public.get_or_create_conversation(p_ad_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_buyer  uuid := auth.uid();
  v_seller uuid;
  v_id     uuid;
begin
  if v_buyer is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select a.seller_id into v_seller
    from public.ads a
   where a.id = p_ad_id and a.allow_messages and a.status = 'published';

  if v_seller is null then
    raise exception 'Cette annonce n''accepte pas les messages.' using errcode = 'P0001';
  end if;
  if v_seller = v_buyer then
    raise exception 'Vous ne pouvez pas vous écrire à vous-même.' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(v_buyer, v_seller) then
    raise exception 'Cette conversation n''accepte plus de nouveaux messages.'
      using errcode = 'P0001';
  end if;

  -- `do nothing` puis relecture : un `do update` exigerait un privilège
  -- d'UPDATE que le client n'a volontairement pas sur ces colonnes.
  insert into public.conversations (ad_id, buyer_id, seller_id)
  values (p_ad_id, v_buyer, v_seller)
  on conflict (ad_id, buyer_id) do nothing;

  select c.id into v_id
    from public.conversations c
   where c.ad_id = p_ad_id and c.buyer_id = v_buyer;

  return v_id;
end;
$$;

-- =============================================================================
-- 6. RECHERCHE DANS LES CONVERSATIONS
-- =============================================================================
--  Chercher « Toyota » doit retrouver le fil portant sur la Toyota, même si le
--  mot n'apparaît dans aucun message : on interroge donc à la fois le contenu
--  des messages, le titre de l'annonce et le nom du correspondant.
--
--  Le résultat reprend les colonnes de `conversations_view`, augmentées d'un
--  extrait et de l'origine de la correspondance : l'interface réutilise ainsi
--  le même composant de liste.
create or replace function public.search_conversations(
  p_query text,
  p_limit integer default 30
)
returns table (
  id                   uuid,
  ad_id                uuid,
  ad_title             text,
  ad_slug              text,
  ad_reference         text,
  ad_cover_image_path  text,
  buyer_id             uuid,
  buyer_name           text,
  buyer_avatar_path    text,
  seller_id            uuid,
  seller_name          text,
  seller_avatar_path   text,
  last_message_at      timestamptz,
  last_message_preview text,
  buyer_unread_count   integer,
  seller_unread_count  integer,
  buyer_archived       boolean,
  seller_archived      boolean,
  match_excerpt        text,
  match_type           text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with params as (
    select
      nullif(btrim(coalesce(p_query, '')), '') as q,
      least(greatest(coalesce(p_limit, 30), 1), 100) as lim
  ),
  matched_messages as (
    -- Message le plus récent correspondant, pour chaque fil.
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.body,
      m.created_at
    from public.messages m
    where (select q from params) is not null
      and m.search_vector @@ websearch_to_tsquery(
            'french', public.immutable_unaccent((select q from params)))
    order by m.conversation_id, m.created_at desc
  )
  select
    v.id, v.ad_id, v.ad_title, v.ad_slug, v.ad_reference, v.ad_cover_image_path,
    v.buyer_id, v.buyer_name, v.buyer_avatar_path,
    v.seller_id, v.seller_name, v.seller_avatar_path,
    v.last_message_at, v.last_message_preview,
    v.buyer_unread_count, v.seller_unread_count,
    v.buyer_archived, v.seller_archived,
    mm.body as match_excerpt,
    case
      when mm.conversation_id is not null then 'message'
      when public.normalize_label(v.ad_title)
           like '%' || public.normalize_label((select q from params)) || '%' then 'annonce'
      else 'correspondant'
    end as match_type
  from public.conversations_view v
  left join matched_messages mm on mm.conversation_id = v.id
  where (select q from params) is not null
    and (
      mm.conversation_id is not null
      or public.normalize_label(v.ad_title)
         like '%' || public.normalize_label((select q from params)) || '%'
      or public.normalize_label(v.buyer_name)
         like '%' || public.normalize_label((select q from params)) || '%'
      or public.normalize_label(v.seller_name)
         like '%' || public.normalize_label((select q from params)) || '%'
    )
  order by coalesce(mm.created_at, v.last_message_at) desc nulls last
  limit (select lim from params);
$$;

comment on function public.search_conversations(text, integer) is
  'Recherche dans les fils de l''appelant : contenu des messages, titre de l''annonce, nom du correspondant.';

-- =============================================================================
-- 7. DIFFUSION TEMPS RÉEL
-- =============================================================================
--  Supabase diffuse les changements des tables inscrites à la publication
--  `supabase_realtime`. La RLS continue de s'appliquer à la diffusion : un
--  abonné ne reçoit que les lignes qu'il aurait le droit de lire.
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : diffusion temps réel non configurée (normal hors Supabase).';
    return;
  end if;

  foreach v_table in array array['messages', 'conversations', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end $$;

-- =============================================================================
-- 8. PRIVILÈGES
-- =============================================================================
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;
grant execute on function public.block_user(uuid, text)          to authenticated;
grant execute on function public.unblock_user(uuid)              to authenticated;
grant execute on function public.list_blocked_users()            to authenticated;
grant execute on function public.send_message(uuid, text, text)  to authenticated;
grant execute on function public.search_conversations(text, integer) to authenticated;
