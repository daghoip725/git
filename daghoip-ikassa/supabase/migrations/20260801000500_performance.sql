-- =============================================================================
--  Daghoip Ikassa — 05. Optimisation des performances
-- =============================================================================
--  Contexte : trafic très majoritairement mobile, connexions parfois lentes.
--  L'objectif est de réduire (a) le nombre d'allers-retours réseau, (b) le
--  volume de données transférées, (c) le coût CPU des requêtes de listage.
--
--  Leviers appliqués ici :
--   1. Vues de lecture pré-jointes (une requête au lieu de trois).
--   2. Vue matérialisée pour les statistiques de la page d'accueil.
--   3. Réglages d'autovacuum sur les tables à fort taux de mise à jour.
--   4. Statistiques étendues sur les colonnes corrélées.
--   5. Tâches planifiées (pg_cron) de maintenance.
-- =============================================================================

-- =============================================================================
-- 1. Vue de listage des annonces
-- =============================================================================
--  Pré-joint la catégorie et l'image de couverture. `security_invoker = true`
--  fait appliquer la RLS de `ads` à l'appelant : la vue n'ouvre aucune brèche.
-- -----------------------------------------------------------------------------
create or replace view public.ads_list_view
with (security_invoker = true)
as
select
  a.id,
  a.reference,
  a.title,
  a.slug,
  a.price,
  a.price_type,
  a.condition,
  a.city,
  a.province,
  a.status,
  a.is_featured,
  a.views_count,
  a.favorites_count,
  a.published_at,
  a.created_at,
  a.seller_id,
  a.category_id,
  c.name as category_name,
  c.slug as category_slug,
  (
    select i.storage_path
      from public.ad_images i
     where i.ad_id = a.id
     order by i."position"
     limit 1
  ) as cover_image_path,
  (
    select count(*) from public.ad_images i where i.ad_id = a.id
  ) as images_count
from public.ads a
left join public.categories c on c.id = a.category_id;

comment on view public.ads_list_view is
  'Annonces pré-jointes (catégorie + image de couverture) pour les grilles. RLS héritée de public.ads.';

grant select on public.ads_list_view to anon, authenticated;

-- =============================================================================
-- 2. Vue des conversations enrichies
-- =============================================================================
create or replace view public.conversations_view
with (security_invoker = true)
as
select
  c.id,
  c.ad_id,
  c.buyer_id,
  c.seller_id,
  c.last_message_at,
  c.last_message_preview,
  c.last_sender_id,
  c.messages_count,
  c.buyer_unread_count,
  c.seller_unread_count,
  c.buyer_archived,
  c.seller_archived,
  c.created_at,
  a.title     as ad_title,
  a.slug      as ad_slug,
  a.reference as ad_reference,
  a.status    as ad_status,
  (
    select i.storage_path
      from public.ad_images i
     where i.ad_id = a.id
     order by i."position"
     limit 1
  ) as ad_cover_image_path,
  buyer.full_name   as buyer_name,
  buyer.avatar_path as buyer_avatar_path,
  seller.full_name   as seller_name,
  seller.avatar_path as seller_avatar_path
from public.conversations c
join public.ads   a      on a.id = c.ad_id
join public.users buyer  on buyer.id = c.buyer_id
join public.users seller on seller.id = c.seller_id;

grant select on public.conversations_view to authenticated;

-- =============================================================================
-- 3. Statistiques de la page d'accueil (vue matérialisée)
-- =============================================================================
--  Les compteurs globaux sont coûteux et n'ont pas besoin d'être exacts à la
--  seconde : on les matérialise et on rafraîchit toutes les 15 minutes.
-- -----------------------------------------------------------------------------
drop materialized view if exists public.platform_stats;
create materialized view public.platform_stats as
select
  (select count(*) from public.ads   where status = 'published')            as published_ads,
  (select count(*) from public.users where status = 'active')               as active_users,
  (select count(distinct city) from public.ads where status = 'published')  as covered_cities,
  (select count(*) from public.ads
    where status = 'published' and published_at > now() - interval '24 hours') as ads_last_24h,
  now() as refreshed_at;

-- Index unique : indispensable pour un REFRESH ... CONCURRENTLY (sans verrou).
create unique index if not exists platform_stats_singleton_idx
  on public.platform_stats (refreshed_at);

grant select on public.platform_stats to anon, authenticated;

create or replace function public.refresh_platform_stats()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently public.platform_stats;
exception
  when others then
    -- Premier rafraîchissement : CONCURRENTLY exige une vue déjà peuplée.
    refresh materialized view public.platform_stats;
end;
$$;

-- =============================================================================
-- 4. Réglages de stockage par table
-- =============================================================================
--  `ads` subit beaucoup d'UPDATE sur ses compteurs (vues, favoris, messages).
--  Un fillfactor < 100 laisse de la place dans chaque page pour les mises à
--  jour HOT, qui évitent de réécrire les index. Un autovacuum plus agressif
--  empêche le gonflement de la table.
-- -----------------------------------------------------------------------------
alter table public.ads set (
  fillfactor = 85,
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

alter table public.conversations set (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05
);

alter table public.users set (fillfactor = 90);

-- Table très insérée puis purgée : vacuum fréquent.
alter table public.notifications set (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);

-- =============================================================================
-- 5. Statistiques étendues
-- =============================================================================
--  `city` et `province` sont fortement corrélées (Libreville ⇒ Estuaire), tout
--  comme `status` et `published_at`. Sans cela le planificateur sous-estime la
--  sélectivité des filtres combinés et bascule à tort sur un parcours séquentiel.
-- -----------------------------------------------------------------------------
drop statistics if exists ads_city_province_stats;
create statistics ads_city_province_stats (dependencies, ndistinct)
  on city, province from public.ads;

drop statistics if exists ads_status_category_stats;
create statistics ads_status_category_stats (dependencies, ndistinct)
  on status, category_id from public.ads;

analyze public.ads;

-- =============================================================================
-- 6. Tâches planifiées (pg_cron)
-- =============================================================================
--  Activez d'abord l'extension depuis le tableau de bord Supabase
--  (Database → Extensions → pg_cron), puis exécutez ce bloc.
--  Il est ignoré silencieusement si pg_cron n'est pas installé.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron absent : planification ignorée. Activez l''extension puis rejouez ce fichier.';
    return;
  end if;

  -- `cron.schedule` remplace une tâche de même nom : le bloc est rejouable.

  -- Expiration des annonces, chaque nuit à 03h00 UTC (04h00 à Libreville).
  perform cron.schedule(
    'daghoip-expire-ads', '0 3 * * *',
    $cron$select public.expire_ads()$cron$
  );

  -- Alerte « expire bientôt », chaque jour à 08h00 UTC (09h00 locale).
  perform cron.schedule(
    'daghoip-notify-expiring-ads', '0 8 * * *',
    $cron$select public.notify_expiring_ads()$cron$
  );

  -- Retrait des mises en avant échues, toutes les heures.
  perform cron.schedule(
    'daghoip-expire-featured', '0 * * * *',
    $cron$select public.expire_featured_ads()$cron$
  );

  -- Clôture des abonnements arrivés à terme, chaque nuit à 02h00 UTC.
  perform cron.schedule(
    'daghoip-expire-subscriptions', '0 2 * * *',
    $cron$select public.expire_subscriptions()$cron$
  );

  -- Purge des notifications lues de plus de 90 jours, chaque dimanche.
  perform cron.schedule(
    'daghoip-purge-notifications', '0 4 * * 0',
    $cron$select public.purge_old_notifications()$cron$
  );

  -- Rafraîchissement des statistiques, toutes les 15 minutes.
  perform cron.schedule(
    'daghoip-refresh-stats', '*/15 * * * *',
    $cron$select public.refresh_platform_stats()$cron$
  );
end
$$;

-- =============================================================================
-- 7. Aide au diagnostic
-- =============================================================================
--  Index jamais utilisés (candidats à la suppression) :
--
--    select relname, indexrelname, idx_scan
--      from pg_stat_user_indexes
--     where schemaname = 'public' and idx_scan = 0
--     order by relname;
--
--  Requêtes les plus coûteuses (nécessite pg_stat_statements) :
--
--    select calls, round(mean_exec_time::numeric, 2) as avg_ms, query
--      from pg_stat_statements
--     order by mean_exec_time desc
--     limit 20;
--
--  Plan réel d'une recherche :
--
--    explain (analyze, buffers)
--    select * from public.search_ads('voiture', 'vehicules', 'Libreville');
-- =============================================================================
