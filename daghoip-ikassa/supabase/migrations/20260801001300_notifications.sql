-- =============================================================================
--  Daghoip Ikassa — 13. Notifications : temps réel, e-mail, alertes
-- =============================================================================
--  L'existant couvrait déjà la notification **dans l'application** : une table
--  `notifications`, une fonction `create_notification()` et une diffusion temps
--  réel. Ce fichier ajoute ce qui manquait vraiment :
--
--   1. les **alertes absentes** — une annonce approuvée par un modérateur ne
--      prévenait personne, pas plus qu'un abonnement sur le point d'expirer ou
--      un premier favori reçu ;
--   2. les **préférences** : sans elles, ajouter l'e-mail revient à imposer des
--      e-mails ;
--   3. une **file d'envoi** (`email_outbox`), parce qu'une base de données ne
--      sait pas envoyer un courriel et ne doit pas essayer.
--
--  ────────────────────────────────────────────────────────────────────────────
--   Pourquoi une file plutôt qu'un envoi direct
--  ────────────────────────────────────────────────────────────────────────────
--
--   Un trigger qui appellerait un service d'e-mail par HTTP ferait dépendre une
--   transaction métier de la disponibilité d'un tiers : l'envoi d'un message
--   échouerait parce qu'un serveur d'e-mail est lent. Ici, le trigger écrit une
--   ligne — opération locale, instantanée, transactionnelle — et un travailleur
--   externe la draine.
--
--   Cela permet aussi le **différé utile** : un e-mail de nouveau message n'est
--   pas expédié tout de suite. Il attend quelques minutes, et s'annule si le
--   destinataire a lu le message entre-temps. Personne ne veut recevoir un
--   courriel pour une conversation qu'il est en train de tenir.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. PRÉFÉRENCES DE NOTIFICATION
-- =============================================================================
--  Une ligne par compte, créée à la volée. Les valeurs par défaut sont pensées
--  pour être **utiles sans être envahissantes** : on prévient par e-mail de ce
--  qu'on risque de manquer (un message, une annonce qui expire), pas de ce
--  qu'on verra de toute façon en revenant sur le site.
create table if not exists public.notification_settings (
  user_id uuid primary key references public.users (id) on delete cascade,

  -- Canal e-mail, par catégorie.
  email_messages       boolean not null default true,
  email_ad_status      boolean not null default true,
  email_reviews        boolean not null default false,
  email_payments       boolean not null default true,
  email_subscription   boolean not null default true,

  /*
   * Délai avant l'envoi d'un e-mail de nouveau message, en minutes.
   * Zéro = envoi immédiat. La valeur par défaut laisse le temps de lire le
   * message dans l'application : l'e-mail est alors annulé.
   */
  message_email_delay_minutes integer not null default 10
    check (message_email_delay_minutes between 0 and 240),

  updated_at timestamptz not null default now()
);

comment on table public.notification_settings is
  'Préférences d''envoi par canal. Absence de ligne = valeurs par défaut.';

alter table public.notification_settings enable row level security;

drop policy if exists notification_settings_select_own on public.notification_settings;
create policy notification_settings_select_own
  on public.notification_settings for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists notification_settings_upsert_own on public.notification_settings;
create policy notification_settings_upsert_own
  on public.notification_settings for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists notification_settings_update_own on public.notification_settings;
create policy notification_settings_update_own
  on public.notification_settings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.notification_settings from anon, authenticated;
grant select on public.notification_settings to authenticated;
grant insert (user_id, email_messages, email_ad_status, email_reviews,
              email_payments, email_subscription, message_email_delay_minutes)
  on public.notification_settings to authenticated;
grant update (email_messages, email_ad_status, email_reviews,
              email_payments, email_subscription, message_email_delay_minutes)
  on public.notification_settings to authenticated;

drop trigger if exists notification_settings_set_updated_at on public.notification_settings;
create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

/**
 * Préférences effectives d'un compte, valeurs par défaut comprises.
 *
 * `security definer` : appelée depuis `create_notification()`, elle doit lire
 * les préférences du **destinataire**, pas celles de l'appelant.
 */
create or replace function public.effective_notification_settings(p_user_id uuid)
returns public.notification_settings
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select s from public.notification_settings s where s.user_id = p_user_id),
    (p_user_id, true, true, false, true, true, 10, now())::public.notification_settings
  );
$$;

-- =============================================================================
-- 2. FILE D'ENVOI DES E-MAILS
-- =============================================================================
--  La base ne rend jamais de HTML : elle range un `kind` et une charge utile,
--  et c'est l'application qui compose le message. Écrire des gabarits d'e-mail
--  en SQL serait pénible à relire, impossible à prévisualiser et à tester.
create table if not exists public.email_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  kind        public.notification_type not null,
  payload     jsonb not null default '{}'::jsonb,

  /*
   * Clé d'unicité des envois non encore expédiés. Elle évite qu'une rafale de
   * dix messages dans la même conversation ne produise dix courriels.
   */
  dedupe_key  text,

  /** Pas avant cet instant : c'est le délai de grâce. */
  not_before  timestamptz not null default now(),

  /** Verrou de traitement, pour qu'un second travailleur ne double pas l'envoi. */
  claimed_at  timestamptz,
  sent_at     timestamptz,
  attempts    smallint not null default 0 check (attempts >= 0),
  last_error  text,
  created_at  timestamptz not null default now()
);

comment on table public.email_outbox is
  'File d''envoi. Une ligne = un e-mail à composer et à expédier par le travailleur.';

-- Index de travail : ce que le travailleur cherche à chaque passage.
create index if not exists email_outbox_pending_idx
  on public.email_outbox (not_before)
  where sent_at is null;

-- L'unicité ne porte que sur les envois **en attente** : la même clé peut
-- resservir une fois le premier courriel parti.
create unique index if not exists email_outbox_dedupe_idx
  on public.email_outbox (dedupe_key)
  where sent_at is null and dedupe_key is not null;

alter table public.email_outbox enable row level security;
-- Aucune politique : la file n'appartient à personne, seul `service_role` la lit.
revoke all on public.email_outbox from anon, authenticated;

-- =============================================================================
-- 3. `create_notification` : un seul entonnoir
-- =============================================================================
--  Toutes les notifications de l'application passent déjà par cette fonction.
--  On y branche l'e-mail plutôt que de disperser des appels dans chaque
--  trigger : c'est la seule façon de garantir qu'un futur type de notification
--  respectera les préférences sans qu'on ait à y penser.
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
  v_id       uuid;
  v_settings public.notification_settings;
  v_wants    boolean;
  v_delay    integer := 0;
  v_dedupe   text;
begin
  -- On ne notifie jamais un compte supprimé ou banni.
  if not exists (
    select 1 from public.users where id = p_user_id and status = 'active'
  ) then
    return null;
  end if;

  insert into public.notifications (user_id, type, title, body, link, data)
  values (p_user_id, p_type, left(p_title, 120), left(p_body, 500), p_link,
          coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  -- --- Volet e-mail ---------------------------------------------------------
  v_settings := public.effective_notification_settings(p_user_id);

  v_wants := case p_type
    when 'new_message'  then v_settings.email_messages
    when 'new_review'   then v_settings.email_reviews
    when 'payment_succeeded' then v_settings.email_payments
    when 'payment_failed'    then v_settings.email_payments
    when 'subscription_expiring' then v_settings.email_subscription
    when 'ad_published' then v_settings.email_ad_status
    when 'ad_approved'  then v_settings.email_ad_status
    when 'ad_rejected'  then v_settings.email_ad_status
    when 'ad_expiring'  then v_settings.email_ad_status
    when 'ad_expired'   then v_settings.email_ad_status
    when 'ad_sold'      then v_settings.email_ad_status
    -- `new_favorite` et `system` restent dans l'application : recevoir un
    -- courriel parce que quelqu'un a cliqué sur un cœur serait pénible.
    else false
  end;

  if not v_wants then
    return v_id;
  end if;

  if p_type = 'new_message' then
    v_delay := v_settings.message_email_delay_minutes;
    -- Une seule attente par conversation : dix messages d'affilée ne font
    -- qu'un courriel.
    v_dedupe := 'msg:' || p_user_id::text || ':'
             || coalesce(p_data ->> 'conversation_id', v_id::text);
  else
    -- Pour les autres types, la notification elle-même est l'unité : deux
    -- événements distincts méritent deux courriels.
    v_dedupe := p_type::text || ':' || v_id::text;
  end if;

  insert into public.email_outbox (user_id, kind, payload, dedupe_key, not_before)
  values (
    p_user_id,
    p_type,
    coalesce(p_data, '{}'::jsonb)
      || jsonb_build_object('title', p_title, 'body', p_body, 'link', p_link,
                            'notification_id', v_id),
    v_dedupe,
    now() + make_interval(mins => v_delay)
  )
  -- Un envoi déjà en attente pour cette clé : on ne l'empile pas, on repousse
  -- juste son échéance pour laisser le temps de lire.
  on conflict (dedupe_key) where sent_at is null and dedupe_key is not null
  do update set not_before = excluded.not_before,
                payload    = excluded.payload;

  return v_id;
end;
$$;

-- =============================================================================
-- 4. ALERTES MANQUANTES SUR LE CYCLE DE VIE D'UNE ANNONCE
-- =============================================================================
--  `ad_rejected`, `ad_expiring` et `ad_expired` existaient déjà. `ad_approved`
--  et `ad_published`, eux, n'étaient jamais émis : un vendeur dont l'annonce
--  passait en revue manuelle n'apprenait sa mise en ligne qu'en revenant voir.
--  C'est précisément le moment où une alerte a de la valeur.
create or replace function public.ads_notify_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'published' then
    if old.status = 'pending_review' then
      perform public.create_notification(
        new.seller_id, 'ad_approved',
        'Votre annonce est approuvée',
        '« ' || new.title || ' » a été validée par notre équipe et est maintenant visible.',
        '/annonces/' || new.slug || '-' || new.reference,
        jsonb_build_object('ad_id', new.id, 'ad_title', new.title)
      );
    elsif old.status in ('draft', 'expired', 'archived') then
      perform public.create_notification(
        new.seller_id, 'ad_published',
        'Votre annonce est en ligne',
        '« ' || new.title || ' » est visible par les acheteurs.',
        '/annonces/' || new.slug || '-' || new.reference,
        jsonb_build_object('ad_id', new.id, 'ad_title', new.title)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ads_notify_status on public.ads;
create trigger ads_notify_status
  after update of status on public.ads
  for each row execute function public.ads_notify_status();

-- =============================================================================
-- 5. ABONNEMENTS SUR LE POINT D'EXPIRER
-- =============================================================================
--  Le type `subscription_expiring` existait sans que rien ne l'émette. Prévenir
--  trois jours avant laisse le temps de renouveler ; prévenir le jour même
--  n'aide personne.
create or replace function public.notify_expiring_subscriptions()
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
    select s.id, s.user_id, s.current_period_end, p.name as plan_name
      from public.subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
     where s.status in ('active', 'trialing')
       and s.auto_renew = false
       and s.current_period_end between now() and now() + interval '3 days'
       -- Une seule alerte par période : sans ce garde, le passage quotidien
       -- enverrait trois courriels pour la même échéance.
       and not exists (
         select 1 from public.notifications n
          where n.user_id = s.user_id
            and n.type = 'subscription_expiring'
            and n.created_at > now() - interval '7 days'
       )
  loop
    perform public.create_notification(
      v_row.user_id, 'subscription_expiring',
      'Votre abonnement expire bientôt',
      'L''offre ' || v_row.plan_name || ' prend fin le '
        || to_char(v_row.current_period_end, 'DD/MM/YYYY') || '.',
      '/premium',
      jsonb_build_object('subscription_id', v_row.id, 'plan_name', v_row.plan_name)
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- =============================================================================
-- 6. PREMIER FAVORI SUR UNE ANNONCE
-- =============================================================================
--  Volontairement limité au **premier** favori de la journée pour une annonce :
--  c'est le signal utile (« votre annonce intéresse »), sans transformer la
--  cloche en compteur de clics.
create or replace function public.favorites_notify_seller()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ad public.ads;
begin
  select * into v_ad from public.ads where id = new.ad_id;

  -- Ni annonce introuvable, ni auto-favori.
  if v_ad.id is null or v_ad.seller_id = new.user_id then
    return new;
  end if;

  if exists (
    select 1 from public.notifications n
     where n.user_id = v_ad.seller_id
       and n.type = 'new_favorite'
       and n.data ->> 'ad_id' = v_ad.id::text
       and n.created_at > now() - interval '24 hours'
  ) then
    return new;
  end if;

  perform public.create_notification(
    v_ad.seller_id, 'new_favorite',
    'Votre annonce intéresse',
    '« ' || v_ad.title || ' » vient d''être ajoutée aux favoris.',
    '/annonces/' || v_ad.slug || '-' || v_ad.reference,
    jsonb_build_object('ad_id', v_ad.id, 'ad_title', v_ad.title)
  );

  return new;
end;
$$;

drop trigger if exists favorites_notify_seller on public.favorites;
create trigger favorites_notify_seller
  after insert on public.favorites
  for each row execute function public.favorites_notify_seller();

-- =============================================================================
-- 7. TRAVAILLEUR D'ENVOI
-- =============================================================================
--  Deux fonctions réservées à `service_role`, appelées par la route
--  `/api/notifications/envoi`. Le découpage « réclamer puis marquer » permet à
--  l'envoi de durer sans bloquer une transaction, et à un e-mail échoué de
--  repartir au tour suivant.

/**
 * Réclame un lot d'e-mails à expédier.
 *
 * `for update skip locked` : deux travailleurs lancés en même temps se
 * partagent la file au lieu d'envoyer deux fois le même message.
 *
 * Un envoi de nouveau message est **abandonné** si le destinataire a lu la
 * notification entre-temps — c'est tout l'intérêt du délai de grâce.
 */
create or replace function public.claim_pending_emails(p_limit integer default 20)
returns table (
  id         uuid,
  user_id    uuid,
  kind       public.notification_type,
  payload    jsonb,
  email      text,
  full_name  text,
  attempts   smallint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    update public.email_outbox o
       set claimed_at = now(), attempts = o.attempts + 1
     where o.id in (
       select c.id
         from public.email_outbox c
        where c.sent_at is null
          and c.not_before <= now()
          -- Après cinq échecs, on cesse : le problème ne vient pas du réseau.
          and c.attempts < 5
          -- Une réclamation de plus de dix minutes est réputée abandonnée
          -- (travailleur interrompu) et peut être reprise.
          and (c.claimed_at is null or c.claimed_at < now() - interval '10 minutes')
        order by c.not_before
        limit least(greatest(coalesce(p_limit, 20), 1), 100)
        for update skip locked
     )
    returning o.*
  )
  select c.id, c.user_id, c.kind, c.payload,
         u.email, p.full_name, c.attempts
    from claimed c
    join public.users p on p.id = c.user_id
    join auth.users u on u.id = c.user_id
   where u.email is not null
     -- Message déjà lu pendant le délai de grâce : l'e-mail n'a plus lieu d'être.
     and not (
       c.kind = 'new_message'
       and exists (
         select 1 from public.notifications n
          where n.id = (c.payload ->> 'notification_id')::uuid
            and n.read_at is not null
       )
     );
end;
$$;

/** Clôt un envoi : `p_error` nul vaut succès. */
create or replace function public.mark_email_sent(p_id uuid, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_outbox
     set sent_at    = case when p_error is null then now() else null end,
         claimed_at = case when p_error is null then claimed_at else null end,
         last_error = left(p_error, 300)
   where id = p_id;
$$;

/**
 * Purge les envois aboutis et ceux définitivement échoués.
 *
 * Les échecs sont gardés plus longtemps que les succès : ce sont eux qu'on
 * relit quand on cherche pourquoi un utilisateur n'a rien reçu.
 */
create or replace function public.purge_email_outbox()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.email_outbox
   where (sent_at is not null and sent_at < now() - interval '7 days')
      or (attempts >= 5 and created_at < now() - interval '30 days');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =============================================================================
-- 8. DIFFUSION TEMPS RÉEL
-- =============================================================================
--  `notifications` est déjà publiée par la migration 09. On s'assure seulement
--  que l'identité de réplication permet au client de filtrer sur `user_id` :
--  sans `replica identity full`, Supabase ne transmet pas les colonnes qui
--  servent au filtre côté abonnement.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'notifications'
    ) then
      execute 'alter publication supabase_realtime add table public.notifications';
    end if;
  else
    raise notice 'Publication supabase_realtime absente : diffusion temps réel non configurée (normal hors Supabase).';
  end if;
end $$;

alter table public.notifications replica identity full;

-- =============================================================================
-- 9. PLANIFICATION
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'notifier-abonnements-expirants', '0 8 * * *',
      $cron$select public.notify_expiring_subscriptions();$cron$
    );
    perform cron.schedule(
      'purger-file-emails', '30 3 * * *',
      $cron$select public.purge_email_outbox();$cron$
    );
  else
    raise notice 'pg_cron absent : planification ignorée. Activez l''extension puis rejouez ce fichier.';
  end if;
end $$;

-- =============================================================================
-- 10. PRIVILÈGES
-- =============================================================================
grant execute on function public.effective_notification_settings(uuid) to authenticated;

--  Le travailleur d'envoi n'est jamais joignable depuis le navigateur.
revoke all on function public.claim_pending_emails(integer) from public, anon, authenticated;
revoke all on function public.mark_email_sent(uuid, text)   from public, anon, authenticated;
revoke all on function public.purge_email_outbox()          from public, anon, authenticated;
revoke all on function public.notify_expiring_subscriptions() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.claim_pending_emails(integer) to service_role';
    execute 'grant execute on function public.mark_email_sent(uuid, text) to service_role';
    execute 'grant execute on function public.purge_email_outbox() to service_role';
    execute 'grant execute on function public.notify_expiring_subscriptions() to service_role';
  end if;
end $$;
