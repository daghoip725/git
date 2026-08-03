-- =============================================================================
--  Daghoip Ikassa — 14. Historiques : recherches et annonces consultées
-- =============================================================================
--  Deux historiques personnels, qui répondent à deux besoins distincts :
--
--   * **recherches** — retrouver « Toyota Corolla Libreville » sans le retaper
--     sur un clavier de téléphone ;
--   * **annonces consultées** — reprendre une visite là où on l'a laissée,
--     souvent d'un appareil à l'autre : on regarde une voiture sur son
--     téléphone à midi, on la retrouve le soir sur un ordinateur.
--
--  ────────────────────────────────────────────────────────────────────────────
--   Ce que ces tables ne sont pas
--  ────────────────────────────────────────────────────────────────────────────
--
--   Ce ne sont **pas** des journaux d'audience. Elles enregistrent ce que
--   quelqu'un cherche et regarde : c'est parmi les données les plus intimes que
--   produit une plateforme d'annonces — on y lit un déménagement, une naissance,
--   une difficulté financière. Quatre règles en découlent, et elles ne sont pas
--   négociables :
--
--    1. **Personne d'autre que l'intéressé n'y accède.** Pas même un
--       administrateur : la RLS ne prévoit aucune exception pour le personnel,
--       contrairement à toutes les autres tables du projet.
--    2. **Effaçables à tout moment**, entièrement ou ligne à ligne.
--    3. **Conservation bornée** : 90 jours, purgés automatiquement. Un
--       historique qu'on garde indéfiniment finit par être réclamé par
--       quelqu'un.
--    4. **Bornés en volume** : 30 recherches et 100 annonces par compte. Au-delà,
--       les plus anciennes disparaissent — ce n'est plus un historique utile,
--       c'est un dossier.
--
--   Les statistiques d'audience, elles, restent agrégées dans `ads.views_count`,
--   qui ne dit pas *qui* a regardé.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. HISTORIQUE DES RECHERCHES
-- =============================================================================
create table if not exists public.search_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,

  /** Texte saisi, tel quel — c'est ce qu'on réaffiche. */
  query      text not null check (char_length(query) between 1 and 120),

  /**
   * Forme normalisée servant au dédoublonnage : « TOYOTA  corolla » et
   * « toyota corolla » sont la même recherche. Calculée en base pour que le
   * client ne puisse pas contourner l'unicité.
   */
  query_key  text not null,

  /** Filtres actifs au moment de la recherche (ville, catégorie, prix…). */
  filters    jsonb not null default '{}'::jsonb,

  /** Nombre de résultats obtenus : « 0 résultat » mérite d'être affiché. */
  results_count integer check (results_count is null or results_count >= 0),

  created_at timestamptz not null default now()
);

comment on table public.search_history is
  'Recherches récentes d''un compte. Strictement privé : aucune lecture par le personnel.';

-- Une seule ligne par recherche : la relancer remonte l'existante.
create unique index if not exists search_history_unique_idx
  on public.search_history (user_id, query_key);

create index if not exists search_history_recent_idx
  on public.search_history (user_id, created_at desc);

alter table public.search_history enable row level security;

--  Aucune politique pour le personnel : c'est délibéré, et c'est la seule
--  table du projet dans ce cas.
drop policy if exists search_history_own on public.search_history;
create policy search_history_own
  on public.search_history for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists search_history_delete_own on public.search_history;
create policy search_history_delete_own
  on public.search_history for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.search_history from anon, authenticated;
grant select, delete on public.search_history to authenticated;
--  Pas de droit d'INSERT : l'écriture passe par `record_search()`, qui
--  normalise et applique le plafond. Sans cela, un client pourrait saturer sa
--  propre table.

-- =============================================================================
-- 2. HISTORIQUE DES ANNONCES CONSULTÉES
-- =============================================================================
create table if not exists public.ad_views (
  user_id   uuid not null references public.users (id) on delete cascade,
  ad_id     uuid not null references public.ads (id) on delete cascade,
  /** Dernière consultation : revoir une annonce la remonte, sans doublon. */
  viewed_at timestamptz not null default now(),
  /** Nombre de consultations : un retour répété marque un intérêt réel. */
  view_count integer not null default 1 check (view_count > 0),

  primary key (user_id, ad_id)
);

comment on table public.ad_views is
  'Annonces consultées par un compte. Strictement privé : aucune lecture par le personnel.';

create index if not exists ad_views_recent_idx on public.ad_views (user_id, viewed_at desc);

alter table public.ad_views enable row level security;

drop policy if exists ad_views_own on public.ad_views;
create policy ad_views_own
  on public.ad_views for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists ad_views_delete_own on public.ad_views;
create policy ad_views_delete_own
  on public.ad_views for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.ad_views from anon, authenticated;
grant select, delete on public.ad_views to authenticated;

-- =============================================================================
-- 3. ENREGISTREMENT
-- =============================================================================

/**
 * Normalise une recherche pour le dédoublonnage.
 *
 * Même traitement que `normalize_label` (migration 08) : minuscules, accents
 * retirés, ponctuation ramenée à une espace. Deux façons d'écrire la même
 * recherche donnent la même clé.
 */
create or replace function public.search_key(p_query text)
returns text
language sql
immutable
set search_path = public
as $$
  select public.normalize_label(p_query);
$$;

/**
 * Enregistre une recherche.
 *
 * `security definer` pour deux raisons : appliquer le plafond de 30 entrées que
 * le client ne doit pas pouvoir contourner, et écrire sans lui accorder un
 * droit d'INSERT sur la table.
 *
 * Silencieuse pour un visiteur anonyme : côté navigateur, l'historique local
 * prend le relais. Lever une exception ferait échouer une recherche parfaitement
 * valide pour une raison qui ne regarde pas l'utilisateur.
 */
create or replace function public.record_search(
  p_query   text,
  p_filters jsonb default '{}'::jsonb,
  p_results integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_query text := btrim(coalesce(p_query, ''));
  v_key   text;
  v_max   constant integer := 30;
begin
  if v_user is null or v_query = '' then
    return;
  end if;

  -- Une recherche d'un seul caractère n'a rien à faire dans un historique.
  if char_length(v_query) < 2 then
    return;
  end if;

  v_key := public.search_key(v_query);
  if v_key is null or v_key = '' then
    return;
  end if;

  /*
   * `clock_timestamp()` et non `now()` : `now()` renvoie l'heure de **début de
   * transaction**, identique pour toutes les écritures d'une même transaction.
   * Deux recherches enregistrées coup sur coup porteraient alors le même
   * horodatage, et l'éviction ci-dessous — qui garde « les trente plus
   * récentes » — deviendrait arbitraire : elle pourrait supprimer la dernière.
   */
  insert into public.search_history (user_id, query, query_key, filters, results_count, created_at)
  values (v_user, left(v_query, 120), v_key, coalesce(p_filters, '{}'::jsonb), p_results,
          clock_timestamp())
  on conflict (user_id, query_key) do update
    set created_at    = clock_timestamp(),
        query         = excluded.query,
        filters       = excluded.filters,
        results_count = excluded.results_count;

  -- Plafond : au-delà, ce n'est plus un historique utile.
  delete from public.search_history
   where user_id = v_user
     and id not in (
       select id from public.search_history
        where user_id = v_user
        order by created_at desc
        limit v_max
     );
end;
$$;

comment on function public.record_search(text, jsonb, integer) is
  'Enregistre une recherche pour le compte courant. Sans effet pour un visiteur anonyme.';

/**
 * Enregistre la consultation d'une annonce.
 *
 * Distincte de `increment_ad_views()`, qui alimente le compteur public : celle-ci
 * dit *qui* a regardé, l'autre *combien de fois*. Les séparer permet de purger
 * l'une sans toucher à l'autre — effacer son historique ne doit pas faire
 * baisser le compteur d'une annonce.
 *
 * Le vendeur n'entre pas dans son propre historique : relire sa propre annonce
 * n'est pas une visite.
 */
create or replace function public.record_ad_view(p_ad_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user constant uuid := auth.uid();
  v_max  constant integer := 100;
  v_seller uuid;
begin
  if v_user is null or p_ad_id is null then
    return;
  end if;

  select seller_id into v_seller from public.ads
   where id = p_ad_id and status in ('published', 'sold');

  if v_seller is null or v_seller = v_user then
    return;
  end if;

  -- `clock_timestamp()` pour la même raison que dans `record_search()` :
  -- l'ordre de l'historique doit refléter l'ordre réel des consultations.
  insert into public.ad_views (user_id, ad_id, viewed_at)
  values (v_user, p_ad_id, clock_timestamp())
  on conflict (user_id, ad_id) do update
    set viewed_at  = clock_timestamp(),
        view_count = public.ad_views.view_count + 1;

  delete from public.ad_views
   where user_id = v_user
     and ad_id not in (
       select ad_id from public.ad_views
        where user_id = v_user
        order by viewed_at desc
        limit v_max
     );
end;
$$;

comment on function public.record_ad_view(uuid) is
  'Enregistre une consultation pour le compte courant. Sans effet pour un visiteur anonyme ou pour le vendeur.';

-- =============================================================================
-- 4. LECTURE
-- =============================================================================

/**
 * Annonces consultées récemment, prêtes à l'affichage.
 *
 * `security invoker` : la RLS de `ad_views` et celle de `ads` s'appliquent
 * toutes deux. Une annonce retirée depuis la visite disparaît donc de
 * l'historique sans qu'on ait à la filtrer ici — et c'est le comportement
 * souhaité, on ne renvoie pas quelqu'un vers une annonce qui n'existe plus.
 */
create or replace function public.recent_ad_views(p_limit integer default 24)
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
  viewed_at        timestamptz,
  view_count       integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    v.id, v.reference, v.title, v.slug, v.price, v.price_type, v.city,
    v.is_featured, v.views_count, v.published_at, v.created_at,
    v.category_name, v.category_slug, v.cover_image_path,
    h.viewed_at, h.view_count
  from public.ad_views h
  join public.ads_list_view v on v.id = h.ad_id
  where v.status = 'published'
  order by h.viewed_at desc
  limit least(greatest(coalesce(p_limit, 24), 1), 100);
$$;

/** Recherches récentes du compte courant. */
create or replace function public.recent_searches(p_limit integer default 10)
returns table (
  id         uuid,
  query      text,
  filters    jsonb,
  results_count integer,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select h.id, h.query, h.filters, h.results_count, h.created_at
    from public.search_history h
   where h.user_id = auth.uid()
   order by h.created_at desc
   limit least(greatest(coalesce(p_limit, 10), 1), 30);
$$;

-- =============================================================================
-- 5. EFFACEMENT
-- =============================================================================
--  La suppression ligne à ligne passe par la politique RLS `delete`. Ces deux
--  fonctions couvrent le « tout effacer », qui doit être un seul geste : obliger
--  quelqu'un à supprimer trente lignes une par une n'est pas lui offrir le
--  contrôle de ses données.

/** Efface tout l'historique de recherche du compte courant. */
create or replace function public.clear_search_history()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.search_history where user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/** Efface tout l'historique de consultation du compte courant. */
create or replace function public.clear_ad_views()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_count integer;
begin
  delete from public.ad_views where user_id = auth.uid();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- =============================================================================
-- 6. CONSERVATION BORNÉE
-- =============================================================================
--  Quatre-vingt-dix jours. Un historique conservé indéfiniment finit par être
--  réclamé — par une autorité, par un employé curieux, par une fuite. Le
--  meilleur moyen de ne pas divulguer une donnée reste de ne plus l'avoir.
create or replace function public.purge_history()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer; v_total integer := 0;
begin
  delete from public.search_history where created_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  delete from public.ad_views where viewed_at < now() - interval '90 days';
  get diagnostics v_count = row_count;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purger-historiques', '15 4 * * *',
      $cron$select public.purge_history();$cron$
    );
  else
    raise notice 'pg_cron absent : planification ignorée. Activez l''extension puis rejouez ce fichier.';
  end if;
end $$;

-- =============================================================================
-- 7. PRIVILÈGES
-- =============================================================================
grant execute on function public.search_key(text)                      to authenticated;
grant execute on function public.record_search(text, jsonb, integer)   to authenticated;
grant execute on function public.record_ad_view(uuid)                  to authenticated;
grant execute on function public.recent_ad_views(integer)              to authenticated;
grant execute on function public.recent_searches(integer)              to authenticated;
grant execute on function public.clear_search_history()                to authenticated;
grant execute on function public.clear_ad_views()                      to authenticated;

--  La purge est une tâche de maintenance : elle traverse les historiques de
--  tout le monde et n'a rien à faire à portée d'un client.
revoke all on function public.purge_history() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.purge_history() to service_role';
  end if;
end $$;
