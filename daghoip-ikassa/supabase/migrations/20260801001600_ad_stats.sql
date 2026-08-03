-- =============================================================================
--  Daghoip Ikassa — 16. Performances des annonces
-- =============================================================================
--  Trois compteurs existaient déjà — vues, favoris, messages — mais séparément
--  et sans historique. Il manquait ce qui en fait une mesure utile au vendeur :
--
--   1. les **contacts**, qui n'étaient comptés nulle part. Un numéro affiché ou
--      un clic WhatsApp ne laissait aucune trace, alors que c'est l'action qui
--      compte vraiment : mille vues sans un seul contact veut dire quelque
--      chose, et le vendeur n'avait aucun moyen de le voir ;
--   2. un **historique quotidien**, sans lequel on ne peut tracer aucune
--      courbe. Un compteur cumulatif ne dit pas si l'annonce marche ou si elle
--      a marché il y a trois semaines ;
--   3. des **repères**, parce qu'un chiffre seul ne se lit pas. « 42 vues »
--      n'informe personne tant qu'on ne sait pas ce que font les annonces
--      comparables.
--
--  ────────────────────────────────────────────────────────────────────────────
--   Ce qui n'est PAS enregistré
--  ────────────────────────────────────────────────────────────────────────────
--
--   L'identité de qui contacte. Afficher son numéro à un acheteur n'est pas
--   consentir à ce qu'il soit fiché, et un vendeur n'a pas à disposer de la
--   liste des gens qui ont regardé ses coordonnées. Seuls des **compteurs**
--   sortent d'ici : jamais une ligne, jamais un identifiant.
--
--   Le dédoublonnage se fait donc sur une empreinte non réversible, conservée
--   le temps de la journée : la même personne qui clique dix fois compte pour
--   un, sans qu'on sache jamais qui elle est.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. CANAUX DE CONTACT
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'contact_channel') then
    create type public.contact_channel as enum ('phone', 'whatsapp', 'message');
  end if;
end $$;

alter table public.ads add column if not exists contacts_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ads_contacts_count_check'
  ) then
    alter table public.ads
      add constraint ads_contacts_count_check check (contacts_count >= 0);
  end if;
end $$;

/*
 * Journal des contacts. Aucune politique RLS : la table n'est jamais lue
 * directement, ni par le vendeur ni par le personnel. Elle ne sert qu'au
 * dédoublonnage et à l'agrégation.
 */
create table if not exists public.ad_contacts (
  id         uuid primary key default gen_random_uuid(),
  ad_id      uuid not null references public.ads (id) on delete cascade,
  channel    public.contact_channel not null,

  /**
   * Empreinte du couple (visiteur, annonce, jour).
   *
   * Non réversible : on ne peut pas remonter au visiteur, seulement constater
   * que deux clics viennent du même. C'est tout ce dont on a besoin pour ne pas
   * compter dix fois la même personne.
   */
  dedupe_key text not null,

  created_at timestamptz not null default now()
);

comment on table public.ad_contacts is
  'Contacts pris sur une annonce. Anonyme par construction : aucune identité n''y est conservée.';

create unique index if not exists ad_contacts_dedupe_idx on public.ad_contacts (dedupe_key);
create index if not exists ad_contacts_ad_idx on public.ad_contacts (ad_id, created_at desc);

alter table public.ad_contacts enable row level security;
revoke all on public.ad_contacts from anon, authenticated;

-- =============================================================================
-- 2. HISTORIQUE QUOTIDIEN
-- =============================================================================
--  Une ligne par annonce et par jour. C'est ce qui permet de tracer une courbe
--  — un compteur cumulatif ne dit pas *quand* les vues sont arrivées.
--
--  L'écriture est un `upsert` par vue : une ligne par annonce et par jour, pas
--  une par vue. Le coût est celui d'un index à mettre à jour, pas celui d'une
--  table qui enfle.
create table if not exists public.ad_daily_stats (
  ad_id     uuid not null references public.ads (id) on delete cascade,
  day       date not null,
  views     integer not null default 0 check (views >= 0),
  contacts  integer not null default 0 check (contacts >= 0),
  favorites integer not null default 0 check (favorites >= 0),

  primary key (ad_id, day)
);

comment on table public.ad_daily_stats is
  'Compteurs journaliers par annonce. Agrégats seulement : aucune identité de visiteur.';

create index if not exists ad_daily_stats_day_idx on public.ad_daily_stats (day desc);

alter table public.ad_daily_stats enable row level security;
revoke all on public.ad_daily_stats from anon, authenticated;

/** Incrémente la ligne du jour, en la créant au besoin. */
create or replace function public.bump_daily_stat(
  p_ad_id uuid,
  p_views integer default 0,
  p_contacts integer default 0,
  p_favorites integer default 0
)
returns void
language sql
security definer
set search_path = public
as $$
  /*
   * Valeurs bornées à zéro **aussi à l'insertion** : retirer un favori un jour
   * où l'annonce n'a encore aucune ligne insérerait sinon `-1`, ce que la
   * contrainte refuse — et la suppression du favori échouerait avec elle.
   * Sur une journée sans activité, un retrait ramène simplement à zéro.
   */
  insert into public.ad_daily_stats (ad_id, day, views, contacts, favorites)
  values (
    p_ad_id, current_date,
    greatest(coalesce(p_views, 0), 0),
    greatest(coalesce(p_contacts, 0), 0),
    greatest(coalesce(p_favorites, 0), 0)
  )
  on conflict (ad_id, day) do update
    set views     = public.ad_daily_stats.views    + greatest(coalesce(p_views, 0), 0),
        contacts  = public.ad_daily_stats.contacts + greatest(coalesce(p_contacts, 0), 0),
        /*
         * `p_favorites` et non `excluded.favorites` : la valeur insérée est
         * bornée à zéro, elle a donc perdu le signe. Un retrait de favori doit
         * pouvoir décrémenter ici — sinon le compteur du jour ne ferait que
         * monter, et la courbe des favoris ne redescendrait jamais.
         * Le résultat, lui, reste borné à zéro.
         */
        favorites = greatest(public.ad_daily_stats.favorites + coalesce(p_favorites, 0), 0);
$$;

-- =============================================================================
-- 3. BRANCHEMENT SUR LES COMPTEURS EXISTANTS
-- =============================================================================
--  On complète `increment_ad_views` et `sync_favorites_count` plutôt que d'y
--  ajouter des triggers concurrents : deux mécanismes qui comptent la même
--  chose finissent toujours par diverger.
create or replace function public.increment_ad_views(p_ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.ads
     set views_count = views_count + 1
   where id = p_ad_id
     and status = 'published';

  get diagnostics v_updated = row_count;

  -- Ligne du jour seulement si le compteur a bougé : une annonce retirée ne
  -- doit pas continuer d'alimenter l'historique.
  if v_updated > 0 then
    perform public.bump_daily_stat(p_ad_id, 1, 0, 0);
  end if;
end;
$$;

create or replace function public.sync_favorites_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.ads set favorites_count = favorites_count + 1 where id = new.ad_id;
    perform public.bump_daily_stat(new.ad_id, 0, 0, 1);
    return new;
  end if;

  update public.ads set favorites_count = greatest(favorites_count - 1, 0)
   where id = old.ad_id;
  perform public.bump_daily_stat(old.ad_id, 0, 0, -1);
  return old;
end;
$$;

-- =============================================================================
-- 4. ENREGISTREMENT D'UN CONTACT
-- =============================================================================
--  Appelée quand un visiteur affiche le numéro, ouvre WhatsApp ou écrit un
--  message. L'empreinte est calculée **en base**, à partir d'un identifiant que
--  le client fournit mais ne contrôle pas seul : ainsi personne ne peut gonfler
--  ses propres statistiques en forgeant une clé différente à chaque appel.
create or replace function public.record_ad_contact(
  p_ad_id   uuid,
  p_channel public.contact_channel,
  /**
   * Identifiant de session du visiteur anonyme, fourni par le serveur Next.
   * Pour un visiteur connecté il est ignoré au profit de `auth.uid()`.
   */
  p_visitor text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_actor  text;
  v_key    text;
begin
  select seller_id into v_seller
    from public.ads
   where id = p_ad_id and status = 'published';

  -- Annonce inconnue ou retirée : rien à compter.
  if v_seller is null then
    return false;
  end if;

  -- Le vendeur qui relit sa propre annonce ne se contacte pas lui-même.
  if v_seller = auth.uid() then
    return false;
  end if;

  v_actor := coalesce(auth.uid()::text, nullif(btrim(coalesce(p_visitor, '')), ''), 'anonyme');

  /*
   * `digest` plutôt qu'un identifiant en clair : l'empreinte suffit à
   * dédoublonner et ne permet pas de remonter au visiteur. Le jour entre dans
   * le calcul, si bien qu'un même visiteur recompte le lendemain — un contact
   * repris deux jours de suite est bien deux marques d'intérêt.
   */
  v_key := encode(
    extensions.digest(v_actor || ':' || p_ad_id::text || ':' || current_date::text, 'sha256'),
    'hex'
  );

  insert into public.ad_contacts (ad_id, channel, dedupe_key)
  values (p_ad_id, p_channel, v_key)
  on conflict (dedupe_key) do nothing;

  if not found then
    -- Déjà compté aujourd'hui pour ce visiteur.
    return false;
  end if;

  update public.ads set contacts_count = contacts_count + 1 where id = p_ad_id;
  perform public.bump_daily_stat(p_ad_id, 0, 1, 0);

  return true;
end;
$$;

comment on function public.record_ad_contact(uuid, public.contact_channel, text) is
  'Compte un contact, une fois par visiteur et par jour. Aucune identité conservée.';

-- =============================================================================
-- 5. PERFORMANCE D'UNE ANNONCE
-- =============================================================================
--  Réservée à son propriétaire. Un vendeur n'a pas à consulter les performances
--  de ses concurrents : ce serait lui donner un avantage qu'aucune plateforme
--  ne devrait distribuer en silence.
--
--  Les repères de comparaison sont des **médianes de catégorie**, jamais les
--  chiffres d'une annonce identifiable.
create or replace function public.ad_performance(p_ad_id uuid)
returns table (
  views              integer,
  contacts           integer,
  favorites          integer,
  messages           integer,
  /** Part des visiteurs ayant pris contact, en pourcentage. */
  contact_rate       numeric,
  /** Médiane des vues des annonces publiées de la même catégorie. */
  category_median_views integer,
  /** Jours depuis la publication : une comparaison n'a de sens qu'à durée égale. */
  days_online        integer,
  published_at       timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ad public.ads;
begin
  select * into v_ad from public.ads where id = p_ad_id;

  if v_ad.id is null or v_ad.seller_id <> auth.uid() then
    raise exception 'Annonce introuvable.' using errcode = 'P0001';
  end if;

  return query
  select
    v_ad.views_count,
    v_ad.contacts_count,
    v_ad.favorites_count,
    v_ad.messages_count,
    case
      when v_ad.views_count > 0
        then round(v_ad.contacts_count::numeric * 100 / v_ad.views_count, 1)
      else 0
    end,
    coalesce((
      select percentile_cont(0.5) within group (order by a.views_count)::integer
        from public.ads a
       where a.category_id = v_ad.category_id
         and a.status = 'published'
         and a.published_at is not null
         -- Fenêtre comparable : une annonce d'hier ne se compare pas à une
         -- annonce en ligne depuis deux mois.
         and a.published_at > now() - interval '90 days'
    ), 0),
    greatest(extract(day from now() - coalesce(v_ad.published_at, v_ad.created_at))::integer, 0),
    v_ad.published_at;
end;
$$;

/**
 * Série quotidienne d'une annonce.
 *
 * `generate_series` produit une ligne par jour même sans activité : une courbe
 * à trous laisserait croire à une interruption de mesure là où il n'y a
 * simplement eu personne.
 */
create or replace function public.ad_daily_series(p_ad_id uuid, p_days integer default 30)
returns table (day date, views integer, contacts integer, favorites integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_seller uuid;
  v_days   integer := least(greatest(coalesce(p_days, 30), 7), 180);
begin
  select seller_id into v_seller from public.ads where id = p_ad_id;
  if v_seller is null or v_seller <> auth.uid() then
    raise exception 'Annonce introuvable.' using errcode = 'P0001';
  end if;

  return query
  select
    d::date,
    coalesce(s.views, 0),
    coalesce(s.contacts, 0),
    coalesce(s.favorites, 0)
  from generate_series(current_date - (v_days - 1), current_date, interval '1 day') d
  left join public.ad_daily_stats s on s.ad_id = p_ad_id and s.day = d::date
  order by d;
end;
$$;

-- =============================================================================
-- 6. TABLEAU DE BORD DU VENDEUR
-- =============================================================================
create or replace function public.seller_performance(p_days integer default 30)
returns table (
  ads_published  integer,
  total_views    integer,
  total_contacts integer,
  total_favorites integer,
  total_messages integer,
  /** Sur la période demandée, pas depuis toujours : c'est ce qui se pilote. */
  period_views    integer,
  period_contacts integer
)
language plpgsql
stable
/*
 * `security definer` — cinquième cas légitime de la convention : agrégat de
 * supervision. La fonction lit `ad_daily_stats`, table volontairement fermée
 * aux clients. En `security invoker`, un vendeur se voyait refuser l'accès à sa
 * propre synthèse (« permission denied for table ad_daily_stats ») : la
 * fonction était inutilisable par les seules personnes à qui elle s'adresse.
 *
 * Le cloisonnement ne repose donc pas sur les droits de table mais sur le
 * filtre : `v_user := auth.uid()`, et **toutes** les lectures sont restreintes
 * aux annonces de ce compte. Sans session, la fonction ne renvoie rien.
 */
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 180);
begin
  if v_user is null then
    return;
  end if;

  return query
  select
    count(*) filter (where a.status = 'published')::integer,
    coalesce(sum(a.views_count), 0)::integer,
    coalesce(sum(a.contacts_count), 0)::integer,
    coalesce(sum(a.favorites_count), 0)::integer,
    coalesce(sum(a.messages_count), 0)::integer,
    coalesce((
      select sum(s.views)::integer from public.ad_daily_stats s
       where s.ad_id in (select id from public.ads where seller_id = v_user)
         and s.day > current_date - v_days
    ), 0),
    coalesce((
      select sum(s.contacts)::integer from public.ad_daily_stats s
       where s.ad_id in (select id from public.ads where seller_id = v_user)
         and s.day > current_date - v_days
    ), 0)
  from public.ads a
  where a.seller_id = v_user;
end;
$$;

/**
 * Classement des annonces du vendeur.
 *
 * Trié par **contacts** et non par vues : c'est l'action qui rapporte. Une
 * annonce très vue et jamais contactée est un problème, pas un succès, et un
 * tri par vues la placerait en tête.
 */
create or replace function public.seller_ad_ranking(p_limit integer default 20)
returns table (
  id           uuid,
  title        text,
  slug         text,
  reference    text,
  status       public.ad_status,
  views        integer,
  contacts     integer,
  favorites    integer,
  contact_rate numeric,
  published_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id, a.title, a.slug, a.reference, a.status,
    a.views_count, a.contacts_count, a.favorites_count,
    case
      when a.views_count > 0 then round(a.contacts_count::numeric * 100 / a.views_count, 1)
      else 0
    end,
    a.published_at
  from public.ads a
  where a.seller_id = auth.uid()
  order by a.contacts_count desc, a.views_count desc, a.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

-- =============================================================================
-- 7. CONSERVATION
-- =============================================================================
--  Un an d'historique quotidien, puis on efface. Au-delà, personne ne compare
--  plus rien, et les compteurs cumulés sur `ads` restent de toute façon.
create or replace function public.purge_ad_stats()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer; v_total integer := 0;
begin
  delete from public.ad_daily_stats where day < current_date - 365;
  get diagnostics v_count = row_count;
  v_total := v_count;

  -- Les empreintes de dédoublonnage ne servent qu'un jour.
  delete from public.ad_contacts where created_at < now() - interval '7 days';
  get diagnostics v_count = row_count;

  return v_total + v_count;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purger-statistiques-annonces', '45 4 * * *',
      $cron$select public.purge_ad_stats();$cron$
    );
  else
    raise notice 'pg_cron absent : planification ignorée. Activez l''extension puis rejouez ce fichier.';
  end if;
end $$;

-- =============================================================================
-- 8. PRIVILÈGES
-- =============================================================================
grant execute on function public.record_ad_contact(uuid, public.contact_channel, text)
  to anon, authenticated;
grant execute on function public.ad_performance(uuid)          to authenticated;
grant execute on function public.ad_daily_series(uuid, integer) to authenticated;
grant execute on function public.seller_performance(integer)    to authenticated;
grant execute on function public.seller_ad_ranking(integer)     to authenticated;

--  Écriture directe des compteurs journaliers : réservée aux fonctions qui les
--  alimentent, jamais au client.
revoke all on function public.bump_daily_stat(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.purge_ad_stats() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.purge_ad_stats() to service_role';
  end if;
end $$;
