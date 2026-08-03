-- =============================================================================
--  Daghoip Ikassa — 08. Recherche : quartier, ancienneté, distance
-- =============================================================================
--  Complète `search_ads()` avec les trois filtres qui lui manquaient et lui
--  fait renvoyer le quartier ainsi que la distance calculée.
--
--  Choix de conception : pas de PostGIS ni de `earthdistance`. Une recherche
--  « autour de moi » dans un rayon de quelques dizaines de kilomètres se traite
--  très bien avec un pré-filtre par rectangle englobant — servi par un index
--  B-tree ordinaire — suivi d'une distance de haversine sur le petit nombre de
--  lignes restantes. Ajouter une extension géospatiale complète pour cela
--  compliquerait l'installation sans rien apporter à cette échelle.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. DISTANCE ORTHODROMIQUE
-- =============================================================================
create or replace function public.haversine_km(
  p_lat1 double precision,
  p_lon1 double precision,
  p_lat2 double precision,
  p_lon2 double precision
)
returns double precision
language sql
immutable
parallel safe
as $$
  select 6371.0088 * 2 * asin(
    sqrt(
      power(sin(radians(p_lat2 - p_lat1) / 2), 2)
      + cos(radians(p_lat1)) * cos(radians(p_lat2))
        * power(sin(radians(p_lon2 - p_lon1) / 2), 2)
    )
  );
$$;

comment on function public.haversine_km(double precision, double precision, double precision, double precision) is
  'Distance en kilomètres entre deux points, sur une sphère de rayon moyen terrestre.';

-- =============================================================================
-- 2. NORMALISATION D'UN LIBELLÉ LIBRE
-- =============================================================================
--  Le quartier est saisi à la main. « Nzeng-Ayong », « nzeng ayong » et
--  « NZENG   AYONG » désignent le même endroit ; sans normalisation, filtrer
--  sur l'un ne trouverait pas les autres et la liste des quartiers se
--  peuplerait de doublons.
--
--  On ramène donc au minimum commun : minuscules, sans accents, et toute
--  ponctuation ramenée à une espace simple. IMMUTABLE, condition nécessaire
--  pour indexer l'expression.
create or replace function public.normalize_label(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    btrim(
      regexp_replace(
        lower(public.immutable_unaccent(coalesce(p_value, ''))),
        '[^a-z0-9]+', ' ', 'g'
      )
    ),
    ''
  );
$$;

comment on function public.normalize_label(text) is
  'Forme comparable d''un libellé libre : minuscules, sans accents, ponctuation ramenée à une espace.';

-- =============================================================================
-- 3. INDEX DE SUPPORT
-- =============================================================================
--  Rectangle englobant : le filtre porte sur latitude ET longitude, un index
--  composite partiel suffit et reste petit (seules les annonces publiées et
--  géolocalisées y figurent).
create index if not exists ads_geo_idx
  on public.ads (latitude, longitude)
  where status = 'published' and latitude is not null and longitude is not null;

--  Quartier : le filtre compare une forme normalisée (sans accent, sans casse,
--  sans espaces superflus). L'index doit porter sur la même expression, sans
--  quoi il ne serait jamais utilisé.
drop index if exists public.ads_district_idx;
create index if not exists ads_district_idx
  on public.ads (city, public.normalize_label(district))
  where status = 'published' and district is not null;

-- =============================================================================
-- 4. QUARTIERS DISPONIBLES
-- =============================================================================
--  Le quartier est un champ libre : « Nzeng-Ayong » et « nzeng ayong »
--  désignent le même endroit. On regroupe sur la forme normalisée et on
--  restitue l'orthographe la plus fréquente, celle que les habitants
--  reconnaîtront.
create or replace function public.list_districts(
  p_city  text    default null,
  p_limit integer default 60
)
returns table (district text, ads_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with normalized as (
    select
      btrim(a.district) as label,
      public.normalize_label(a.district) as key
    from public.ads a
    where a.status = 'published'
      and a.district is not null
      and public.normalize_label(a.district) is not null
      and (p_city is null or a.city = p_city)
  )
  select
    mode() within group (order by n.label) as district,
    count(*)::bigint as ads_count
  from normalized n
  group by n.key
  order by count(*) desc, 1
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

comment on function public.list_districts(text, integer) is
  'Quartiers effectivement présents dans les annonces publiées, du plus fourni au moins fourni.';

-- =============================================================================
-- 5. RECHERCHE
-- =============================================================================
--  La signature change (trois paramètres et deux colonnes de plus) : il faut
--  supprimer l'ancienne version, sinon PostgreSQL créerait une surcharge et
--  PostgREST ne saurait plus laquelle appeler.
drop function if exists public.search_ads(
  text, text, text, text, bigint, bigint,
  public.ad_condition, public.price_type, uuid, boolean, text, integer, integer
);

create or replace function public.search_ads(
  p_query         text                default null,
  p_category_slug text                default null,
  p_city          text                default null,
  p_province      text                default null,
  p_district      text                default null,
  p_min_price     bigint              default null,
  p_max_price     bigint              default null,
  p_condition     public.ad_condition default null,
  p_price_type    public.price_type   default null,
  p_seller_id     uuid                default null,
  p_featured_only boolean             default false,
  p_max_age_days  integer             default null,
  p_latitude      double precision    default null,
  p_longitude     double precision    default null,
  p_radius_km     double precision    default null,
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
  district         text,
  is_featured      boolean,
  views_count      integer,
  published_at     timestamptz,
  created_at       timestamptz,
  category_name    text,
  category_slug    text,
  cover_image_path text,
  distance_km      numeric,
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
      greatest(coalesce(p_offset, 0), 0) as off,
      public.normalize_label(p_district) as district_key,
      -- Le filtre géographique n'est actif que si les trois valeurs sont là.
      (p_latitude is not null and p_longitude is not null
       and p_radius_km is not null and p_radius_km > 0) as geo,
      -- Rayon borné : au-delà de 200 km le rectangle englobant couvrirait le
      -- pays entier et l'index ne servirait plus à rien.
      least(greatest(coalesce(p_radius_km, 0), 0), 200) as radius
  ),
  bbox as (
    select
      -- Un degré de latitude vaut ~111,045 km partout ; un degré de longitude
      -- se resserre vers les pôles, d'où le cosinus. La borne inférieure évite
      -- une division par zéro sur une donnée aberrante.
      (select radius from params) / 111.045 as dlat,
      (select radius from params)
        / greatest(111.045 * cos(radians(coalesce(p_latitude, 0))), 0.0001) as dlon
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
      a.id, a.reference, a.title, a.slug, a.price, a.price_type, a.city, a.district,
      a.is_featured, a.views_count, a.published_at, a.created_at,
      a.category_id,
      case
        when (select q from params) is null then 0
        else ts_rank(
          a.search_vector,
          websearch_to_tsquery('french', public.immutable_unaccent((select q from params)))
        )
      end as rank,
      case
        when (select geo from params)
        then round(
          public.haversine_km(p_latitude, p_longitude, a.latitude, a.longitude)::numeric, 1)
      end as distance_km,
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
      and (
        (select district_key from params) is null
        or public.normalize_label(a.district) = (select district_key from params)
      )
      and (
        p_max_age_days is null
        or a.published_at >= now() - make_interval(days => greatest(p_max_age_days, 0))
      )
      and (
        not (select geo from params)
        or (
          a.latitude  is not null
          and a.longitude is not null
          -- Pré-filtre par rectangle : c'est lui qui utilise `ads_geo_idx`.
          and a.latitude  between p_latitude  - (select dlat from bbox)
                              and p_latitude  + (select dlat from bbox)
          and a.longitude between p_longitude - (select dlon from bbox)
                              and p_longitude + (select dlon from bbox)
          -- Puis distance réelle, sur le petit reliquat.
          and public.haversine_km(p_latitude, p_longitude, a.latitude, a.longitude)
              <= (select radius from params)
        )
      )
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
    f.id, f.reference, f.title, f.slug, f.price, f.price_type, f.city, f.district,
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
    f.distance_km,
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

comment on function public.search_ads is
  'Recherche paginée : texte, catégorie, ville, quartier, prix, état, ancienneté et rayon géographique.';

-- =============================================================================
-- 6. PRIVILÈGES
-- =============================================================================
grant execute on function public.normalize_label(text) to anon, authenticated;

grant execute on function public.haversine_km(
  double precision, double precision, double precision, double precision
) to anon, authenticated;

grant execute on function public.list_districts(text, integer) to anon, authenticated;

grant execute on function public.search_ads(
  text, text, text, text, text, bigint, bigint,
  public.ad_condition, public.price_type, uuid, boolean, integer,
  double precision, double precision, double precision, text, integer, integer
) to anon, authenticated;
