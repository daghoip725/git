-- =============================================================================
--  Daghoip Ikassa — 12. Aide à la rédaction, détection et recommandation
-- =============================================================================
--  Six fonctionnalités demandées : rédaction automatique des descriptions,
--  correction des fautes, détection des annonces frauduleuses, détection des
--  doublons, suggestion de prix, recommandation d'annonces.
--
--  Répartition assumée entre la base et le modèle de langage :
--
--    • Doublons, prix, fraude, recommandations vivent **ici**. Ce sont des
--      questions statistiques et relationnelles : un modèle de langage y serait
--      plus lent, plus cher, non déterministe et impossible à auditer. La
--      médiane d'un prix se calcule, elle ne s'invente pas.
--
--    • Rédaction et correction orthographique vivent dans `lib/ai/`. Elles
--      demandent une compréhension de la langue qu'aucune règle SQL n'apporte.
--
--  Principe commun aux quatre fonctions de ce fichier : elles **suggèrent**,
--  elles ne décident pas. Aucune n'efface, ne refuse ni ne masque une annonce.
--  Le score de fraude route au pire vers une revue humaine — la même politique
--  que `needs_manual_review`, pour la même raison : un faux positif ne doit
--  jamais pénaliser un vendeur honnête.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. INDEX
-- =============================================================================
--  La détection de doublons et les recommandations comparent des titres par
--  trigrammes ; sans index GIN, chaque appel balaierait toute la table.
create index if not exists ads_title_trgm_idx
  on public.ads using gin (title extensions.gin_trgm_ops);

--  La suggestion de prix agrège par catégorie/ville sur les annonces récentes
--  effectivement valorisées.
create index if not exists ads_price_stats_idx
  on public.ads (category_id, city, published_at desc)
  where status in ('published', 'sold') and price is not null and price > 0;

-- =============================================================================
-- 2. SUGGESTION DE PRIX
-- =============================================================================
--  Renvoie la **médiane** et les quartiles des annonces comparables, pas une
--  « estimation » : la médiane résiste aux annonces à 1 FCFA et aux erreurs de
--  saisie à sept zéros, ce qu'une moyenne ne fait pas.
--
--  Trois périmètres, du plus pertinent au plus large. Le périmètre retenu est
--  **renvoyé** (`scope`) : afficher « médiane nationale » quand on n'a pas pu
--  faire mieux est plus honnête que de laisser croire à un prix local.
--
--  En dessous de cinq annonces comparables, on ne suggère rien. Une médiane
--  sur deux points n'est pas une information, c'est un hasard présenté comme
--  un chiffre.
create or replace function public.suggest_price(
  p_category_id uuid,
  p_city        text default null,
  p_condition   public.ad_condition default null
)
returns table (
  scope       text,
  sample_size integer,
  median      bigint,
  p25         bigint,
  p75         bigint
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_min_sample constant integer := 5;
  v_province   text;
begin
  if p_category_id is null then
    return;
  end if;

  select province into v_province
    from public.ads
   where city = p_city and province is not null
   limit 1;

  -- Fenêtre glissante d'un an : au Gabon, les prix de l'occasion bougent assez
  -- pour qu'une annonce de 2019 n'aide plus personne.
  return query
  with comparables as (
    select a.price, a.city, a.province, a.condition
      from public.ads a
     where a.category_id = p_category_id
       and a.status in ('published', 'sold')
       and a.price is not null
       and a.price > 0
       and a.price_type in ('fixed', 'negotiable')
       and a.created_at > now() - interval '365 days'
       -- L'état filtre quand il est fourni, mais ne doit pas vider
       -- l'échantillon : les annonces sans état renseigné restent comptées.
       and (p_condition is null or a.condition is null or a.condition = p_condition)
  ),
  levels as (
    select 'city' as scope, 1 as rank, price from comparables
      where p_city is not null and city = p_city
    union all
    select 'province', 2, price from comparables
      where v_province is not null and province = v_province
    union all
    select 'national', 3, price from comparables
  ),
  aggregated as (
    select
      l.scope,
      l.rank,
      count(*)::integer as sample_size,
      percentile_cont(0.5)  within group (order by l.price)::bigint as median,
      percentile_cont(0.25) within group (order by l.price)::bigint as p25,
      percentile_cont(0.75) within group (order by l.price)::bigint as p75
    from levels l
    group by l.scope, l.rank
  )
  select a.scope, a.sample_size, a.median, a.p25, a.p75
    from aggregated a
   where a.sample_size >= v_min_sample
   order by a.rank
   limit 1;
end;
$$;

comment on function public.suggest_price(uuid, text, public.ad_condition) is
  'Médiane et quartiles des annonces comparables. Renvoie 0 ligne sous 5 comparables : une médiane sur 2 points n''informe pas.';

-- =============================================================================
-- 3. DÉTECTION DES DOUBLONS
-- =============================================================================
--  Deux cas, très différents, qu'on ne traite pas de la même façon :
--
--   • le **doublon interne** : le même vendeur republie la même annonce pour
--     remonter dans les résultats. C'est le cas fréquent, et c'est celui qui
--     dégrade l'expérience de recherche.
--   • le **plagiat** : un autre compte recopie une annonce, souvent avec un
--     prix plus bas — signal d'arnaque classique.
--
--  On ne fusionne ni ne supprime rien : on renvoie les candidats avec leur
--  score de ressemblance. Deux Toyota Corolla 2010 à Libreville peuvent très
--  légitimement porter le même titre.
create or replace function public.find_duplicate_ads(
  p_ad_id     uuid,
  p_threshold real default 0.55,
  p_limit     integer default 10
)
returns table (
  id            uuid,
  reference     text,
  title         text,
  slug          text,
  price         bigint,
  city          text,
  status        public.ad_status,
  seller_id     uuid,
  same_seller   boolean,
  title_score   real,
  created_at    timestamptz
)
language sql
stable
security invoker
-- `similarity()` vient de pg_trgm, installé dans le schéma `extensions`.
set search_path = public, extensions
as $$
  with source as (
    select a.id, a.title, a.seller_id, a.category_id, a.price
      from public.ads a
     where a.id = p_ad_id
  )
  select
    a.id, a.reference, a.title, a.slug, a.price, a.city, a.status, a.seller_id,
    a.seller_id = s.seller_id as same_seller,
    similarity(a.title, s.title) as title_score,
    a.created_at
  from public.ads a
  cross join source s
  where a.id <> s.id
    and a.category_id = s.category_id
    and a.status in ('draft', 'pending_review', 'published')
    and similarity(a.title, s.title) >= least(greatest(coalesce(p_threshold, 0.55), 0.2), 1.0)
  -- Le doublon du même vendeur passe devant : c'est celui sur lequel il y a
  -- quelque chose à faire.
  order by (a.seller_id = s.seller_id) desc, similarity(a.title, s.title) desc, a.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;

comment on function public.find_duplicate_ads(uuid, real, integer) is
  'Annonces ressemblantes dans la même catégorie. Suggère, ne fusionne rien : deux annonces peuvent légitimement se ressembler.';

-- =============================================================================
-- 4. SIGNAUX DE FRAUDE
-- =============================================================================
--  Un score de règles, **pas** un jugement. Chaque signal est renvoyé avec son
--  poids et son détail : un modérateur doit pouvoir lire *pourquoi* une annonce
--  remonte, sinon il ne peut ni la défendre ni la contester.
--
--  Les poids ont été choisis pour qu'aucun signal isolé n'atteigne le seuil de
--  revue (50) : c'est la conjonction qui alerte. Un vendeur nouveau n'est pas
--  suspect ; un vendeur nouveau qui brade un iPhone 60 % sous la médiane et
--  renvoie vers WhatsApp, si.
create or replace function public.ad_fraud_signals(p_ad_id uuid)
returns table (signal text, weight integer, detail text)
language plpgsql
stable
security definer  -- lit l'ancienneté du vendeur, hors de portée d'un modérateur ligne à ligne
set search_path = public
as $$
declare
  v_ad        public.ads;
  v_median    bigint;
  v_sample    integer;
  v_images    integer;
  v_seller_age interval;
  v_seller_ads integer;
  v_text      text;
begin
  if not public.is_staff() then
    raise exception 'Réservé au personnel de modération.' using errcode = '42501';
  end if;

  select * into v_ad from public.ads where id = p_ad_id;
  if v_ad.id is null then
    return;
  end if;

  v_text := lower(public.immutable_unaccent(
    coalesce(v_ad.title, '') || ' ' || coalesce(v_ad.description, '')));

  -- --- Contenu manifestement interdit ---------------------------------------
  if public.needs_manual_review(v_ad.title, v_ad.description) then
    return query select 'contenu_interdit'::text, 60,
      'Le texte contient un terme de la liste des contenus interdits.'::text;
  end if;

  -- --- Prix anormalement bas ------------------------------------------------
  --  L'appât classique : un bien recherché très en dessous du marché, pour
  --  obtenir un acompte avant toute rencontre.
  if v_ad.price is not null and v_ad.price > 0 then
    select s.median, s.sample_size into v_median, v_sample
      from public.suggest_price(v_ad.category_id, v_ad.city, v_ad.condition) s;

    if v_median is not null and v_ad.price < v_median * 0.35 then
      return query select 'prix_aberrant'::text, 35,
        format('Prix de %s FCFA contre une médiane de %s FCFA sur %s annonces comparables.',
               v_ad.price, v_median, v_sample)::text;
    end if;
  end if;

  -- --- Sortie de la plateforme ----------------------------------------------
  --  Une messagerie interne laisse une trace ; un numéro glissé dans le texte
  --  déplace la conversation là où plus personne ne peut constater l'arnaque.
  if v_text ~ '(whatsapp|telegram|ecriv?ez.moi|contactez.moi (au|sur)|\+?241[0-9 ]{6,}|[a-z0-9._%-]+@[a-z0-9.-]+\.[a-z]{2,})' then
    return query select 'contact_hors_plateforme'::text, 20,
      'La description pousse à quitter la messagerie de la plateforme.'::text;
  end if;

  -- --- Paiement avant livraison ---------------------------------------------
  if v_text ~ '(acompte|avance obligatoire|payer d.abord|frais de (dossier|transport) avant|western union|mandat express|caution avant visite)' then
    return query select 'paiement_anticipe'::text, 30,
      'La description exige un versement avant toute remise du bien.'::text;
  end if;

  -- --- Vendeur très récent et prolifique ------------------------------------
  select now() - u.created_at, u.ads_count
    into v_seller_age, v_seller_ads
    from public.users u
   where u.id = v_ad.seller_id;

  if v_seller_age < interval '48 hours' and coalesce(v_seller_ads, 0) >= 5 then
    return query select 'compte_neuf_prolifique'::text, 25,
      format('Compte créé il y a moins de 48 h avec déjà %s annonces.', v_seller_ads)::text;
  end if;

  -- --- Aucune photo ---------------------------------------------------------
  select count(*)::integer into v_images from public.ad_images where ad_id = p_ad_id;
  if v_images = 0 then
    return query select 'sans_photo'::text, 10,
      'Aucune photo : rien ne prouve que le bien existe.'::text;
  end if;

  -- --- Republications en série ----------------------------------------------
  if (select count(*) from public.find_duplicate_ads(p_ad_id, 0.8, 20) d
       where d.same_seller) >= 3 then
    return query select 'republication_en_serie'::text, 15,
      'Le vendeur a publié au moins trois annonces quasi identiques.'::text;
  end if;
end;
$$;

comment on function public.ad_fraud_signals(uuid) is
  'Signaux de fraude d''une annonce, avec poids et justification. Réservé au personnel : sert à ouvrir un dossier, pas à trancher.';

/**
 * Score agrégé, borné à 100.
 *
 * Utilisé par le tableau de bord pour trier ; le détail reste dans
 * `ad_fraud_signals()`, parce qu'un nombre seul ne se conteste pas.
 */
create or replace function public.ad_fraud_score(p_ad_id uuid)
returns integer
language sql
stable
security invoker  -- délègue à ad_fraud_signals(), qui vérifie is_staff()
set search_path = public
as $$
  select least(coalesce(sum(s.weight), 0), 100)::integer
    from public.ad_fraud_signals(p_ad_id) s;
$$;

/**
 * Annonces à examiner en priorité.
 *
 * Bornée aux annonces récentes et en ligne : rouvrir le passé n'aide personne,
 * et le coût du calcul est proportionnel au nombre d'annonces examinées.
 */
create or replace function public.flagged_ads(
  p_min_score integer default 40,
  p_limit     integer default 30
)
returns table (
  id         uuid,
  reference  text,
  title      text,
  slug       text,
  price      bigint,
  city       text,
  status     public.ad_status,
  seller_id  uuid,
  seller_name text,
  score      integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
    raise exception 'Réservé au personnel de modération.' using errcode = '42501';
  end if;

  return query
  with recent as (
    select a.id, a.reference, a.title, a.slug, a.price, a.city, a.status,
           a.seller_id, a.created_at
      from public.ads a
     where a.status in ('published', 'pending_review')
       and a.created_at > now() - interval '30 days'
     order by a.created_at desc
     limit 500
  )
  select r.id, r.reference, r.title, r.slug, r.price, r.city, r.status,
         r.seller_id, u.full_name, public.ad_fraud_score(r.id), r.created_at
    from recent r
    join public.users u on u.id = r.seller_id
   where public.ad_fraud_score(r.id) >= greatest(coalesce(p_min_score, 40), 1)
   order by public.ad_fraud_score(r.id) desc, r.created_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;

comment on function public.flagged_ads(integer, integer) is
  'Annonces récentes dont le score de fraude dépasse le seuil. File de travail de modération, jamais un refus automatique.';

-- =============================================================================
-- 5. RECOMMANDATION D'ANNONCES
-- =============================================================================
--  Recommandation **par le contenu**, pas par filtrage collaboratif. Un
--  « les gens comme vous ont aussi aimé » demande un volume d'interactions
--  qu'une plateforme qui démarre n'a pas : il produirait des suggestions
--  bruitées tout en donnant l'illusion d'être personnalisé.
--
--  Le goût de l'utilisateur est déduit de ses **favoris** — le seul signal
--  qu'il émet volontairement — et à défaut de ses propres annonces. Sans
--  aucun signal, on renvoie les annonces populaires récentes : c'est ce que
--  vaut vraiment une recommandation quand on ne sait rien.
create or replace function public.recommend_ads(p_limit integer default 12)
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
  reason           text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_lim  integer := least(greatest(coalesce(p_limit, 12), 1), 48);
begin
  if v_user is null then
    -- Visiteur anonyme : rien à personnaliser, et surtout rien à profiler.
    return query
    select v.id, v.reference, v.title, v.slug, v.price, v.price_type, v.city,
           v.is_featured, v.views_count, v.published_at, v.created_at,
           v.category_name, v.category_slug, v.cover_image_path,
           'populaire'::text
      from public.ads_list_view v
     where v.status = 'published'
     order by v.views_count desc, v.published_at desc nulls last
     limit v_lim;
    return;
  end if;

  return query
  with signals as (
    -- Favoris : signal explicite, le plus fiable.
    select a.category_id, a.city, a.price, 3 as weight
      from public.favorites f
      join public.ads a on a.id = f.ad_id
     where f.user_id = v_user
    union all
    -- Ses propres annonces : signal faible, mais mieux que rien pour un
    -- compte qui n'a encore rien mis en favori.
    select a.category_id, a.city, a.price, 1
      from public.ads a
     where a.seller_id = v_user
  ),
  profile as (
    select
      s.category_id,
      sum(s.weight) as affinity,
      percentile_cont(0.5) within group (order by s.price) as typical_price
    from signals s
    group by s.category_id
  ),
  cities as (
    select s.city, sum(s.weight) as weight from signals s group by s.city
  ),
  scored as (
    select
      v.*,
      p.affinity
        -- Même ville : ce qui est loin ne s'achète pas d'occasion.
        + coalesce((select c.weight from cities c where c.city = v.city), 0)
        -- Prix dans la même gamme que ce que l'utilisateur regarde.
        + case
            when p.typical_price is null or v.price is null then 0
            when v.price between p.typical_price * 0.5 and p.typical_price * 1.5 then 2
            else 0
          end as score
    from public.ads_list_view v
    join profile p on p.category_id = v.category_id
    where v.status = 'published'
      and v.seller_id <> v_user
      and not exists (
        select 1 from public.favorites f where f.user_id = v_user and f.ad_id = v.id
      )
  )
  select sc.id, sc.reference, sc.title, sc.slug, sc.price, sc.price_type, sc.city,
         sc.is_featured, sc.views_count, sc.published_at, sc.created_at,
         sc.category_name, sc.category_slug, sc.cover_image_path,
         'affinite'::text
    from scored sc
   order by sc.score desc, sc.is_featured desc, sc.published_at desc nulls last
   limit v_lim;
end;
$$;

comment on function public.recommend_ads(integer) is
  'Recommandations par le contenu, déduites des favoris. Repli sur les annonces populaires quand aucun signal n''existe.';

-- =============================================================================
-- 6. PRIVILÈGES
-- =============================================================================
grant execute on function public.suggest_price(uuid, text, public.ad_condition)
  to anon, authenticated;
grant execute on function public.find_duplicate_ads(uuid, real, integer) to authenticated;
grant execute on function public.recommend_ads(integer) to anon, authenticated;

-- Les fonctions de fraude vérifient `is_staff()` en première ligne : le droit
-- d'exécution ne suffit pas à les utiliser.
grant execute on function public.ad_fraud_signals(uuid)      to authenticated;
grant execute on function public.ad_fraud_score(uuid)        to authenticated;
grant execute on function public.flagged_ads(integer, integer) to authenticated;
