-- =============================================================================
--  Daghoip Ikassa — 02. Fonctions SQL, triggers et RPC
-- =============================================================================
--  Conventions de sécurité appliquées ici :
--
--   * `security invoker` (défaut) partout où la RLS doit s'appliquer à
--     l'appelant — c'est le cas de toutes les RPC de lecture/écriture métier.
--   * `security definer` réservé aux fonctions qui doivent légitimement
--     dépasser la RLS : lecture du rôle (sinon récursion de politique),
--     création d'une notification destinée à AUTRUI, maintenance planifiée.
--   * Toute fonction `security definer` fige `search_path` pour empêcher le
--     détournement par un schéma temporaire.
-- =============================================================================

-- =============================================================================
-- 1. Utilitaires
-- =============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- `unaccent` réellement IMMUTABLE (forme à regdictionary), utilisable dans un
-- index ou une colonne calculée.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, $1);
$$;

-- Référence publique courte et non devinable (ex. « K7QX2M4A »).
-- Alphabet sans I, O, 0 ni 1 : pas de confusion à la lecture ou à la dictée.
create or replace function public.generate_reference(p_length integer default 8)
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..p_length loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- Référence de paiement lisible : DI-PAY-20260801-XXXXXX
create or replace function public.generate_payment_reference()
returns text
language sql
volatile
as $$
  select 'DI-PAY-' || to_char(now(), 'YYYYMMDD') || '-' || public.generate_reference(6);
$$;

-- =============================================================================
-- 2. Rôles et autorisations
-- =============================================================================
--  `security definer` indispensable : une politique RLS de `public.users` qui
--  interrogerait `public.users` provoquerait une récursion infinie.
-- -----------------------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.role from public.users u where u.id = auth.uid()),
    'user'::public.user_role
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select public.current_user_role() in ('moderator', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_user_role() = 'admin';
$$;

-- Compte actif ? Un compte suspendu ou banni ne peut plus rien écrire.
create or replace function public.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select u.status = 'active' from public.users u where u.id = auth.uid()),
    false
  );
$$;

-- =============================================================================
-- 3. Cycle de vie du compte
-- =============================================================================

-- Création automatique du profil applicatif à l'inscription.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, full_name, phone, city)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(coalesce(new.email, 'utilisateur'), '@', 1)
    ),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'city'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Fiche complète du compte connecté, coordonnées privées incluses.
-- Nécessaire car la lecture publique de `users` est restreinte par colonnes.
create or replace function public.get_my_profile()
returns public.users
language sql
stable
security definer
set search_path = public
as $$
  select u.* from public.users u where u.id = auth.uid();
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 4. Offres et quotas
-- =============================================================================

-- Offre applicable à un utilisateur : son abonnement en cours, ou le plan
-- « free » par défaut.
create or replace function public.effective_plan(p_user_id uuid)
returns public.subscription_plans
language sql
stable
security definer
set search_path = public
as $$
  select p.*
    from public.subscription_plans p
    join public.subscriptions s on s.plan_id = p.id
   where s.user_id = p_user_id
     and s.status in ('trialing', 'active')
     and s.current_period_end > now()
   order by p.price desc
   limit 1;
$$;

create or replace function public.ad_quota(p_user_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_quota integer;
begin
  select max_active_ads into v_quota from public.effective_plan(p_user_id);

  if v_quota is null then
    select max_active_ads into v_quota
      from public.subscription_plans
     where code = 'free' and is_active
     limit 1;
  end if;

  return coalesce(v_quota, 5);
end;
$$;

-- Refuse la publication au-delà du quota de l'offre.
create or replace function public.enforce_ad_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active integer;
  v_quota  integer;
begin
  -- Seul le passage à « published » consomme du quota.
  if new.status <> 'published' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  v_quota := public.ad_quota(new.seller_id);

  select count(*) into v_active
    from public.ads
   where seller_id = new.seller_id
     and status = 'published'
     and id <> new.id;

  if v_active >= v_quota then
    raise exception
      'Quota atteint : votre offre autorise % annonces en ligne simultanément.', v_quota
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- =============================================================================
-- 5. Annonces
-- =============================================================================

-- Trigger central de l'annonce :
--   * verrouille les champs privilégiés (compteurs, mise en avant, vendeur) ;
--   * attribue la référence publique et dérive le slug ;
--   * recalcule l'index de recherche plein texte pondéré ;
--   * pose les dates de publication, d'expiration et de vente.
create or replace function public.ads_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- --- Champs privilégiés ---------------------------------------------------
  --  À l'INSERT, on impose les valeurs de départ : le GRANT INSERT ne porte
  --  déjà pas sur ces colonnes, ceci en est le filet de sécurité.
  if tg_op = 'INSERT' and not public.is_staff() and auth.uid() is not null then
    new.is_featured      := false;
    new.featured_until   := null;
    new.views_count      := 0;
    new.favorites_count  := 0;
    new.messages_count   := 0;
    new.rejection_reason := null;
  end if;

  --  À l'UPDATE, on ne fige QUE l'identité de l'annonce.
  --
  --  ⚠️ Ne jamais restaurer ici les compteurs (views_count, favorites_count,
  --  messages_count) ni is_featured : ces colonnes sont légitimement mises à
  --  jour par des fonctions SECURITY DEFINER (increment_ad_views,
  --  sync_favorites_count, messages_after_insert, payments_after_update) qui
  --  s'exécutent DANS la session de l'utilisateur — `auth.uid()` y est donc
  --  toujours renseigné. Les restaurer annulerait silencieusement ces mises à
  --  jour. La protection contre l'écriture directe par le client est assurée
  --  par les privilèges de colonnes (GRANT UPDATE, migration 03).
  if tg_op = 'UPDATE' then
    new.reference  := old.reference;
    new.seller_id  := old.seller_id;
    new.created_at := old.created_at;
  end if;

  -- --- Référence publique ---------------------------------------------------
  if new.reference is null or new.reference = '' then
    loop
      new.reference := public.generate_reference(8);
      exit when not exists (select 1 from public.ads where reference = new.reference);
    end loop;
  end if;

  -- --- Slug dérivé du titre -------------------------------------------------
  if new.slug is null or new.slug = ''
     or (tg_op = 'UPDATE' and new.title is distinct from old.title) then
    new.slug := trim(both '-' from
      regexp_replace(lower(public.immutable_unaccent(new.title)), '[^a-z0-9]+', '-', 'g')
    );
    new.slug := trim(both '-' from left(new.slug, 70));
    if new.slug = '' then new.slug := 'annonce'; end if;
  end if;

  -- --- Recherche plein texte : titre > ville > description -------------------
  new.search_vector :=
      setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.title, ''))), 'A')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.city, ''))), 'B')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.district, ''))), 'B')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.description, ''))), 'C');

  -- --- Dates gérées par la base ---------------------------------------------
  if new.status = 'published' then
    if new.published_at is null then new.published_at := now(); end if;
    if new.expires_at   is null then new.expires_at   := now() + interval '60 days'; end if;
  end if;

  if new.status = 'sold' and new.sold_at is null then
    new.sold_at := now();
  elsif new.status <> 'sold' then
    new.sold_at := null;
  end if;

  -- Une mise en avant échue redevient une annonce ordinaire.
  if new.featured_until is not null and new.featured_until <= now() then
    new.is_featured    := false;
    new.featured_until := null;
  end if;

  return new;
end;
$$;

drop trigger if exists ads_before_write on public.ads;
create trigger ads_before_write
  before insert or update on public.ads
  for each row execute function public.ads_before_write();

drop trigger if exists ads_enforce_quota on public.ads;
create trigger ads_enforce_quota
  before insert or update on public.ads
  for each row execute function public.enforce_ad_quota();

drop trigger if exists ads_set_updated_at on public.ads;
create trigger ads_set_updated_at
  before update on public.ads
  for each row execute function public.set_updated_at();

-- --- Compteurs dénormalisés ---------------------------------------------------
-- Maintient `categories.ads_count` et `users.ads_count` (annonces publiées).
create or replace function public.sync_ads_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_published boolean := tg_op <> 'INSERT' and old.status = 'published';
  v_is_published  boolean := tg_op <> 'DELETE' and new.status = 'published';
begin
  -- Sortie de l'état publié (ou changement de catégorie).
  if v_was_published then
    update public.categories set ads_count = greatest(ads_count - 1, 0)
     where id = old.category_id;
    update public.users set ads_count = greatest(ads_count - 1, 0)
     where id = old.seller_id;
  end if;

  if v_is_published then
    update public.categories set ads_count = ads_count + 1 where id = new.category_id;
    update public.users      set ads_count = ads_count + 1 where id = new.seller_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists ads_sync_counters on public.ads;
create trigger ads_sync_counters
  after insert or update of status, category_id or delete on public.ads
  for each row execute function public.sync_ads_counters();

-- Plafonne le nombre de photos selon l'offre du vendeur (8 au maximum).
create or replace function public.enforce_ad_image_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_max    integer;
  v_count  integer;
begin
  select seller_id into v_seller from public.ads where id = new.ad_id;
  if v_seller is null then
    raise exception 'Annonce introuvable.' using errcode = 'P0001';
  end if;

  select max_images_per_ad into v_max from public.effective_plan(v_seller);
  v_max := coalesce(v_max, 8);

  select count(*) into v_count from public.ad_images where ad_id = new.ad_id;

  if v_count >= v_max then
    raise exception 'Une annonce ne peut pas dépasser % photos.', v_max
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists ad_images_limit on public.ad_images;
create trigger ad_images_limit
  before insert on public.ad_images
  for each row execute function public.enforce_ad_image_limit();

-- Incrémente les vues sans accorder de droit UPDATE sur l'annonce.
create or replace function public.increment_ad_views(p_ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ads
     set views_count = views_count + 1
   where id = p_ad_id
     and status = 'published';
end;
$$;

-- =============================================================================
-- 6. Notifications
-- =============================================================================
--  `security definer` : une notification est TOUJOURS créée pour autrui
--  (le destinataire n'est pas l'appelant).
-- -----------------------------------------------------------------------------
create or replace function public.create_notification(
  p_user_id uuid,
  p_type    public.notification_type,
  p_title   text,
  p_body    text default null,
  p_link    text default null,
  p_data    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- On ne notifie jamais un compte supprimé ou banni.
  if not exists (
    select 1 from public.users where id = p_user_id and status = 'active'
  ) then
    return null;
  end if;

  insert into public.notifications (user_id, type, title, body, link, data)
  values (p_user_id, p_type, left(p_title, 120), left(p_body, 500), p_link, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any(p_ids));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.unread_notifications_count()
returns integer
language sql
stable
security invoker
set search_path = public
as $$
  select count(*)::int
    from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;

-- =============================================================================
-- 7. Favoris
-- =============================================================================

create or replace function public.sync_favorites_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.ads set favorites_count = favorites_count + 1 where id = new.ad_id;
    return new;
  end if;

  update public.ads set favorites_count = greatest(favorites_count - 1, 0)
   where id = old.ad_id;
  return old;
end;
$$;

drop trigger if exists favorites_sync_count on public.favorites;
create trigger favorites_sync_count
  after insert or delete on public.favorites
  for each row execute function public.sync_favorites_count();

-- Bascule atomique : évite les états incohérents en cas de double clic.
create or replace function public.toggle_favorite(p_ad_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user   uuid := auth.uid();
  v_exists boolean;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.favorites where user_id = v_user and ad_id = p_ad_id
  ) into v_exists;

  if v_exists then
    delete from public.favorites where user_id = v_user and ad_id = p_ad_id;
    return false;
  end if;

  -- L'INSERT est soumis à la RLS : une annonce non visible sera rejetée.
  insert into public.favorites (user_id, ad_id) values (v_user, p_ad_id);
  return true;
end;
$$;

-- =============================================================================
-- 8. Conversations et messages
-- =============================================================================

-- Ouvre (ou retrouve) le fil entre l'utilisateur courant et le vendeur.
-- `security invoker` : la RLS de `conversations` valide l'insertion.
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

  -- La lecture est filtrée par la RLS de `ads` : une annonce non publiée
  -- ressort simplement comme introuvable.
  select seller_id into v_seller
    from public.ads
   where id = p_ad_id and status = 'published' and allow_messages;

  if v_seller is null then
    raise exception 'Cette annonce n’accepte pas la messagerie.' using errcode = 'P0001';
  end if;

  if v_seller = v_buyer then
    raise exception 'Vous ne pouvez pas vous écrire à vous-même.' using errcode = 'P0001';
  end if;

  select id into v_id
    from public.conversations
   where ad_id = p_ad_id and buyer_id = v_buyer;

  if v_id is not null then
    return v_id;
  end if;

  -- `do nothing` (et non `do update`) : le client n'a pas — et ne doit pas
  -- avoir — le droit UPDATE sur `conversations` en dehors de l'archivage.
  -- La relecture qui suit couvre le cas d'une création concurrente.
  insert into public.conversations (ad_id, buyer_id, seller_id)
  values (p_ad_id, v_buyer, v_seller)
  on conflict (ad_id, buyer_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
      from public.conversations
     where ad_id = p_ad_id and buyer_id = v_buyer;
  end if;

  return v_id;
end;
$$;

-- Met à jour le fil (aperçu, compteurs de non-lus) et notifie le destinataire.
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation public.conversations;
  v_recipient    uuid;
  v_sender_name  text;
  v_ad_slug      text;
  v_ad_reference text;
begin
  select * into v_conversation from public.conversations where id = new.conversation_id;

  v_recipient := case
    when new.sender_id = v_conversation.buyer_id then v_conversation.seller_id
    else v_conversation.buyer_id
  end;

  update public.conversations
     set last_message_at      = new.created_at,
         last_message_preview = left(new.body, 160),
         last_sender_id       = new.sender_id,
         messages_count       = messages_count + 1,
         buyer_unread_count   = buyer_unread_count
                                  + (case when v_recipient = buyer_id  then 1 else 0 end),
         seller_unread_count  = seller_unread_count
                                  + (case when v_recipient = seller_id then 1 else 0 end),
         -- Un nouveau message sort le fil des archives des deux côtés.
         buyer_archived       = false,
         seller_archived      = false,
         updated_at           = now()
   where id = new.conversation_id;

  update public.ads set messages_count = messages_count + 1
   where id = v_conversation.ad_id;

  select full_name into v_sender_name from public.users where id = new.sender_id;
  select slug, reference into v_ad_slug, v_ad_reference
    from public.ads where id = v_conversation.ad_id;

  perform public.create_notification(
    v_recipient,
    'new_message',
    coalesce(v_sender_name, 'Un utilisateur') || ' vous a envoyé un message',
    left(new.body, 160),
    '/messages/' || v_conversation.id::text,
    jsonb_build_object(
      'conversation_id', v_conversation.id,
      'ad_id', v_conversation.ad_id,
      'ad_href', '/annonces/' || coalesce(v_ad_slug, 'annonce') || '-' || coalesce(v_ad_reference, '')
    )
  );

  return new;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Envoi d'un message. L'autorisation réelle vient de la RLS de `messages`.
create or replace function public.send_message(p_conversation_id uuid, p_body text)
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

  insert into public.messages (conversation_id, sender_id, body)
  values (p_conversation_id, auth.uid(), trim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;

-- Marque comme lus les messages reçus dans un fil.
-- `security definer` : la fonction remet à zéro les compteurs dénormalisés de
-- `conversations`, colonnes volontairement non accordées au client. Elle
-- vérifie donc elle-même que l'appelant est bien participant du fil.
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_count integer;
begin
  update public.messages m
     set read_at = now()
   where m.conversation_id = p_conversation_id
     and m.sender_id <> v_user
     and m.read_at is null
     -- Garde-fou : la RLS empêche déjà de toucher un fil dont on n'est pas
     -- participant, cette condition rend l'intention explicite.
     and exists (
       select 1 from public.conversations c
        where c.id = p_conversation_id
          and (c.buyer_id = v_user or c.seller_id = v_user)
     );

  get diagnostics v_count = row_count;

  update public.conversations
     set buyer_unread_count  = case when buyer_id  = v_user then 0 else buyer_unread_count  end,
         seller_unread_count = case when seller_id = v_user then 0 else seller_unread_count end
   where id = p_conversation_id
     and (buyer_id = v_user or seller_id = v_user);

  return v_count;
end;
$$;

drop trigger if exists conversations_set_updated_at on public.conversations;
create trigger conversations_set_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

-- =============================================================================
-- 9. Avis
-- =============================================================================

-- Un avis n'est recevable que s'il existe une mise en relation réelle :
-- une conversation sur l'annonce entre les deux parties.
create or replace function public.can_review(p_reviewer uuid, p_reviewee uuid, p_ad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.conversations c
     where (p_ad_id is null or c.ad_id = p_ad_id)
       and (
         (c.buyer_id = p_reviewer and c.seller_id = p_reviewee) or
         (c.seller_id = p_reviewer and c.buyer_id = p_reviewee)
       )
       and c.messages_count > 0
  );
$$;

-- Recalcule la note moyenne du destinataire de l'avis.
create or replace function public.sync_user_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(new.reviewee_id, old.reviewee_id);
begin
  update public.users u
     set rating_average = coalesce(stats.avg_rating, 0),
         rating_count   = coalesce(stats.total, 0)
    from (
      select round(avg(rating)::numeric, 2) as avg_rating, count(*) as total
        from public.reviews
       where reviewee_id = v_user and status = 'published'
    ) stats
   where u.id = v_user;

  return coalesce(new, old);
end;
$$;

drop trigger if exists reviews_sync_rating on public.reviews;
create trigger reviews_sync_rating
  after insert or update of rating, status or delete on public.reviews
  for each row execute function public.sync_user_rating();

drop trigger if exists reviews_set_updated_at on public.reviews;
create trigger reviews_set_updated_at
  before update on public.reviews
  for each row execute function public.set_updated_at();

-- Notifie l'utilisateur évalué.
create or replace function public.reviews_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer text;
begin
  if new.status <> 'published' then
    return new;
  end if;

  select full_name into v_reviewer from public.users where id = new.reviewer_id;

  perform public.create_notification(
    new.reviewee_id,
    'new_review',
    coalesce(v_reviewer, 'Un utilisateur') || ' vous a laissé un avis',
    'Note : ' || new.rating || '/5',
    '/compte/avis',
    jsonb_build_object('review_id', new.id, 'rating', new.rating)
  );

  return new;
end;
$$;

drop trigger if exists reviews_notify on public.reviews;
create trigger reviews_notify
  after insert on public.reviews
  for each row execute function public.reviews_notify();

-- =============================================================================
-- 10. Abonnements et paiements
-- =============================================================================

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists subscription_plans_set_updated_at on public.subscription_plans;
create trigger subscription_plans_set_updated_at
  before update on public.subscription_plans
  for each row execute function public.set_updated_at();

-- Référence de paiement attribuée automatiquement.
create or replace function public.payments_before_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.reference is null or new.reference = '' then
    loop
      new.reference := public.generate_payment_reference();
      exit when not exists (select 1 from public.payments where reference = new.reference);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists payments_before_insert on public.payments;
create trigger payments_before_insert
  before insert on public.payments
  for each row execute function public.payments_before_insert();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- Applique les effets d'un paiement abouti : activation de l'abonnement ou
-- mise en avant de l'annonce, puis notification.
create or replace function public.payments_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans;
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'succeeded' then
    -- Abonnement : prolongation de la période en cours.
    if new.subscription_id is not null then
      select p.* into v_plan
        from public.subscription_plans p
        join public.subscriptions s on s.plan_id = p.id
       where s.id = new.subscription_id;

      update public.subscriptions
         set status               = 'active',
             current_period_start = now(),
             current_period_end   = now() + case v_plan.billing_interval
                                              when 'monthly'   then interval '1 month'
                                              when 'quarterly' then interval '3 months'
                                              when 'yearly'    then interval '1 year'
                                            end,
             cancelled_at = null,
             ended_at     = null
       where id = new.subscription_id;
    end if;

    -- Mise en avant d'une annonce : 7 jours à la une.
    if new.ad_id is not null and new.purpose in ('ad_feature', 'ad_boost') then
      update public.ads
         set is_featured    = true,
             featured_until = greatest(coalesce(featured_until, now()), now()) + interval '7 days'
       where id = new.ad_id;
    end if;

    perform public.create_notification(
      new.user_id, 'payment_succeeded', 'Paiement confirmé',
      'Votre paiement de ' || new.amount || ' FCFA a été confirmé.',
      '/compte/paiements',
      jsonb_build_object('payment_id', new.id, 'reference', new.reference)
    );

  elsif new.status = 'failed' then
    perform public.create_notification(
      new.user_id, 'payment_failed', 'Paiement échoué',
      coalesce(new.failure_reason, 'Votre paiement n’a pas abouti. Veuillez réessayer.'),
      '/compte/paiements',
      jsonb_build_object('payment_id', new.id, 'reference', new.reference)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists payments_after_update on public.payments;
create trigger payments_after_update
  after update of status on public.payments
  for each row execute function public.payments_after_update();

-- =============================================================================
-- 11. Recherche d'annonces (RPC optimisée)
-- =============================================================================
--  Un seul aller-retour réseau : filtres, tri, pagination, image de couverture
--  et total de résultats (via une fonction fenêtre) sont calculés côté base.
--  `security invoker` : la RLS de `ads` s'applique normalement.
-- -----------------------------------------------------------------------------
create or replace function public.search_ads(
  p_query         text                default null,
  p_category_slug text                default null,
  p_city          text                default null,
  p_province      text                default null,
  p_min_price     bigint              default null,
  p_max_price     bigint              default null,
  p_condition     public.ad_condition default null,
  p_price_type    public.price_type   default null,
  p_seller_id     uuid                default null,
  p_featured_only boolean             default false,
  p_sort          text                default 'recent',
  p_limit         integer             default 24,
  p_offset        integer             default 0
)
returns table (
  id               uuid,
  reference        text,
  title            text,
  slug             text,
  price            bigint,
  price_type       public.price_type,
  city             text,
  is_featured      boolean,
  views_count      integer,
  published_at     timestamptz,
  created_at       timestamptz,
  category_name    text,
  category_slug    text,
  cover_image_path text,
  total_count      bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      nullif(trim(coalesce(p_query, '')), '') as q,
      least(greatest(coalesce(p_limit, 24), 1), 48) as lim,
      greatest(coalesce(p_offset, 0), 0) as off
  ),
  category_ids as (
    -- Une catégorie racine inclut ses sous-catégories.
    select c.id
      from public.categories c
     where p_category_slug is not null
       and (c.slug = p_category_slug
            or c.parent_id = (select id from public.categories where slug = p_category_slug))
  ),
  filtered as (
    select
      a.id, a.reference, a.title, a.slug, a.price, a.price_type, a.city,
      a.is_featured, a.views_count, a.published_at, a.created_at,
      a.category_id,
      case
        when (select q from params) is null then 0
        else ts_rank(
          a.search_vector,
          websearch_to_tsquery('french', public.immutable_unaccent((select q from params)))
        )
      end as rank,
      count(*) over () as total_count
    from public.ads a
    where a.status = 'published'
      and (p_category_slug is null or a.category_id in (select id from category_ids))
      and (
        (select q from params) is null
        or a.search_vector @@ websearch_to_tsquery(
             'french', public.immutable_unaccent((select q from params))
           )
      )
      and (p_city       is null or a.city       = p_city)
      and (p_province   is null or a.province   = p_province)
      and (p_condition  is null or a.condition  = p_condition)
      and (p_price_type is null or a.price_type = p_price_type)
      and (p_seller_id  is null or a.seller_id  = p_seller_id)
      and (not coalesce(p_featured_only, false) or a.is_featured)
      and (p_min_price  is null or a.price >= p_min_price)
      and (p_max_price  is null or a.price <= p_max_price)
    order by
      a.is_featured desc,
      case when p_sort = 'relevance' and (select q from params) is not null
           then ts_rank(a.search_vector,
                        websearch_to_tsquery('french',
                          public.immutable_unaccent((select q from params))))
      end desc nulls last,
      case when p_sort = 'price_asc'  then a.price end asc  nulls last,
      case when p_sort = 'price_desc' then a.price end desc nulls last,
      case when p_sort = 'popular'    then a.views_count end desc nulls last,
      a.published_at desc nulls last
    limit  (select lim from params)
    offset (select off from params)
  )
  select
    f.id, f.reference, f.title, f.slug, f.price, f.price_type, f.city,
    f.is_featured, f.views_count, f.published_at, f.created_at,
    c.name as category_name,
    c.slug as category_slug,
    (
      select i.storage_path
        from public.ad_images i
       where i.ad_id = f.id
       order by i."position"
       limit 1
    ) as cover_image_path,
    f.total_count
  from filtered f
  left join public.categories c on c.id = f.category_id
  order by
    f.is_featured desc,
    case when p_sort = 'relevance'  then f.rank end desc nulls last,
    case when p_sort = 'price_asc'  then f.price end asc  nulls last,
    case when p_sort = 'price_desc' then f.price end desc nulls last,
    case when p_sort = 'popular'    then f.views_count end desc nulls last,
    f.published_at desc nulls last;
$$;

-- Suggestions d'autocomplétion (recherche approximative sur le titre).
create or replace function public.suggest_ads(p_query text, p_limit integer default 8)
returns table (title text, slug text, reference text)
language sql
stable
security invoker
-- `extensions` doit être dans le search_path : l'opérateur `%` et la fonction
-- `similarity()` proviennent de pg_trgm, installé dans ce schéma.
set search_path = public, extensions
as $$
  select a.title, a.slug, a.reference
    from public.ads a
   where a.status = 'published'
     and a.title % p_query
   order by similarity(a.title, p_query) desc, a.published_at desc
   limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

-- =============================================================================
-- 12. Maintenance planifiée (pg_cron)
-- =============================================================================

-- Bascule les annonces arrivées à échéance et prévient leur auteur.
create or replace function public.expire_ads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    record;
  v_count  integer := 0;
begin
  for v_row in
    update public.ads
       set status = 'expired'
     where status = 'published'
       and expires_at is not null
       and expires_at < now()
    returning id, seller_id, title, slug, reference
  loop
    perform public.create_notification(
      v_row.seller_id, 'ad_expired', 'Votre annonce a expiré',
      '« ' || v_row.title || ' » n’est plus visible. Remettez-la en ligne en un clic.',
      '/compte/annonces',
      jsonb_build_object('ad_id', v_row.id)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Prévient 5 jours avant l'expiration.
create or replace function public.notify_expiring_ads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   record;
  v_count integer := 0;
begin
  for v_row in
    select a.id, a.seller_id, a.title
      from public.ads a
     where a.status = 'published'
       and a.expires_at between now() and now() + interval '5 days'
       -- Pas deux fois la même alerte pour la même annonce.
       and not exists (
         select 1 from public.notifications n
          where n.user_id = a.seller_id
            and n.type = 'ad_expiring'
            and n.data ->> 'ad_id' = a.id::text
            and n.created_at > now() - interval '7 days'
       )
  loop
    perform public.create_notification(
      v_row.seller_id, 'ad_expiring', 'Votre annonce expire bientôt',
      '« ' || v_row.title || ' » sera retirée dans moins de 5 jours.',
      '/compte/annonces',
      jsonb_build_object('ad_id', v_row.id)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Retire les mises en avant échues.
create or replace function public.expire_featured_ads()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.ads
     set is_featured = false, featured_until = null
   where is_featured and featured_until is not null and featured_until < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Clôture les abonnements arrivés à terme.
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.subscriptions
     set status   = 'expired',
         ended_at = now()
   where status in ('active', 'trialing', 'past_due')
     and current_period_end < now()
     and not auto_renew;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Purge les notifications lues de plus de 90 jours (croissance maîtrisée).
create or replace function public.purge_old_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.notifications
   where read_at is not null and created_at < now() - interval '90 days';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
