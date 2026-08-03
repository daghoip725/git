-- =============================================================================
--  Daghoip Ikassa — 10. Statistiques d'administration
-- =============================================================================
--  Trois fonctions d'agrégation pour le tableau de bord : indicateurs
--  instantanés, série quotidienne et répartitions.
--
--  Convention SECURITY DEFINER — quatrième cas légitime
--  ---------------------------------------------------
--  Les trois fonctions sont SECURITY DEFINER, avec un contrôle `is_staff()`
--  **explicite en première ligne**. La raison est concrète : compter les
--  messages échangés suppose de traverser une table dont la RLS est nominative
--  (`messages_select_participant`), ce qu'aucun modérateur ne peut faire — et
--  ne doit pas pouvoir faire, s'agissant du contenu.
--
--  Ces fonctions ne renvoient donc **que des nombres agrégés** : jamais une
--  ligne, jamais un extrait, jamais un identifiant. La supervision d'une
--  plateforme n'exige pas de lire le courrier de ses utilisateurs.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. INDICATEURS INSTANTANÉS
-- =============================================================================
create or replace function public.admin_kpis()
returns table (
  total_users            bigint,
  active_users           bigint,
  suspended_users        bigint,
  verified_users         bigint,
  staff_users            bigint,
  new_users_30d          bigint,
  total_ads              bigint,
  published_ads          bigint,
  pending_review_ads     bigint,
  expired_ads            bigint,
  new_ads_30d            bigint,
  open_reports           bigint,
  pending_verifications  bigint,
  active_subscriptions   bigint,
  messages_30d           bigint,
  revenue_30d            bigint,
  revenue_total          bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Réservé à l''équipe de modération.' using errcode = '42501';
  end if;

  return query
  select
    (select count(*) from public.users),
    (select count(*) from public.users where status = 'active'),
    (select count(*) from public.users where status in ('suspended', 'banned')),
    (select count(*) from public.users where is_verified),
    (select count(*) from public.users where role <> 'user'),
    (select count(*) from public.users where created_at >= now() - interval '30 days'),
    (select count(*) from public.ads),
    (select count(*) from public.ads where status = 'published'),
    (select count(*) from public.ads where status = 'pending_review'),
    (select count(*) from public.ads where status = 'expired'),
    (select count(*) from public.ads where created_at >= now() - interval '30 days'),
    (select count(*) from public.reports where status in ('open', 'reviewing')),
    (select count(*) from public.verification_requests where status = 'pending'),
    (select count(*) from public.subscriptions where status in ('trialing', 'active')),
    (select count(*) from public.messages where created_at >= now() - interval '30 days'),
    (select coalesce(sum(amount), 0)::bigint from public.payments
      where status = 'succeeded' and coalesce(paid_at, created_at) >= now() - interval '30 days'),
    (select coalesce(sum(amount), 0)::bigint from public.payments where status = 'succeeded');
end;
$$;

comment on function public.admin_kpis() is
  'Indicateurs instantanés du tableau de bord. Agrégats seuls, réservés au staff.';

-- =============================================================================
-- 2. SÉRIE QUOTIDIENNE
-- =============================================================================
--  `generate_series` produit **tous** les jours de la fenêtre, y compris ceux
--  sans activité : un graphique dont l'axe saute les jours creux ment sur la
--  forme de la courbe.
create or replace function public.admin_daily_stats(p_days integer default 30)
returns table (
  day          date,
  new_users    bigint,
  new_ads      bigint,
  new_messages bigint,
  revenue      bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 180);
begin
  if not public.is_staff() then
    raise exception 'Réservé à l''équipe de modération.' using errcode = '42501';
  end if;

  return query
  with span as (
    select generate_series(
      current_date - (v_days - 1),
      current_date,
      interval '1 day'
    )::date as day
  ),
  users_by_day as (
    select u.created_at::date as day, count(*)::bigint as total
      from public.users u
     where u.created_at >= current_date - (v_days - 1)
     group by 1
  ),
  ads_by_day as (
    select a.created_at::date as day, count(*)::bigint as total
      from public.ads a
     where a.created_at >= current_date - (v_days - 1)
     group by 1
  ),
  messages_by_day as (
    select m.created_at::date as day, count(*)::bigint as total
      from public.messages m
     where m.created_at >= current_date - (v_days - 1)
     group by 1
  ),
  revenue_by_day as (
    select coalesce(p.paid_at, p.created_at)::date as day,
           coalesce(sum(p.amount), 0)::bigint as total
      from public.payments p
     where p.status = 'succeeded'
       and coalesce(p.paid_at, p.created_at) >= current_date - (v_days - 1)
     group by 1
  )
  select
    s.day,
    coalesce(u.total, 0),
    coalesce(a.total, 0),
    coalesce(m.total, 0),
    coalesce(r.total, 0)
  from span s
  left join users_by_day    u on u.day = s.day
  left join ads_by_day      a on a.day = s.day
  left join messages_by_day m on m.day = s.day
  left join revenue_by_day  r on r.day = s.day
  order by s.day;
end;
$$;

comment on function public.admin_daily_stats(integer) is
  'Série quotidienne sur 7 à 180 jours, jours creux inclus. Réservée au staff.';

-- =============================================================================
-- 3. RÉPARTITIONS
-- =============================================================================
--  Une seule fonction pour trois dimensions : catégorie, ville, statut. Le
--  paramètre est validé contre une liste fermée — jamais interpolé dans du SQL.
create or replace function public.admin_ad_distribution(
  p_dimension text    default 'category',
  p_limit     integer default 8
)
returns table (label text, total bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 50);
begin
  if not public.is_staff() then
    raise exception 'Réservé à l''équipe de modération.' using errcode = '42501';
  end if;

  if p_dimension = 'category' then
    return query
      select c.name, count(*)::bigint
        from public.ads a
        join public.categories c on c.id = a.category_id
       where a.status = 'published'
       group by c.name
       order by 2 desc, 1
       limit v_limit;

  elsif p_dimension = 'city' then
    return query
      select a.city, count(*)::bigint
        from public.ads a
       where a.status = 'published'
       group by a.city
       order by 2 desc, 1
       limit v_limit;

  elsif p_dimension = 'status' then
    return query
      select a.status::text, count(*)::bigint
        from public.ads a
       group by a.status
       order by 2 desc, 1
       limit v_limit;

  else
    raise exception 'Dimension inconnue : %', p_dimension using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.admin_ad_distribution(text, integer) is
  'Répartition des annonces par catégorie, ville ou statut. Réservée au staff.';

-- =============================================================================
-- 4. INDEX DE SUPPORT
-- =============================================================================
--  Les séries quotidiennes balaient une fenêtre de dates : un index sur
--  `created_at` évite un parcours complet à chaque affichage du tableau de bord.
create index if not exists users_created_at_idx    on public.users (created_at desc);
create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists payments_paid_at_idx    on public.payments (paid_at desc)
  where status = 'succeeded';

-- =============================================================================
-- 5. PRIVILÈGES
-- =============================================================================
grant execute on function public.admin_kpis()                        to authenticated;
grant execute on function public.admin_daily_stats(integer)          to authenticated;
grant execute on function public.admin_ad_distribution(text, integer) to authenticated;
