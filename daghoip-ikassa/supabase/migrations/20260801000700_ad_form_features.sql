-- =============================================================================
--  Daghoip Ikassa — 07. Formulaire d'annonce : durée, mise en avant, contrôles
-- =============================================================================
--  Trois besoins du formulaire de dépôt ont des implications côté base :
--
--   1. **Durée de publication choisie** — `expires_at` n'était pas accordé à
--      l'insertion ; il l'est désormais, mais borné par la base pour qu'un
--      vendeur ne s'octroie pas une visibilité illimitée.
--   2. **Mise en avant payante** — `is_featured` reste inaccessible au client.
--      Le formulaire crée une DEMANDE, dont le tarif est lu côté serveur ;
--      l'annonce n'est mise en avant qu'au paiement confirmé.
--   3. **Validation automatique du contenu** — les annonces portant sur des
--      produits manifestement interdits partent en revue manuelle au lieu
--      d'être publiées directement.
-- =============================================================================

-- =============================================================================
-- 1. Durée de publication
-- =============================================================================
--  Le vendeur choisit 30, 60 ou 90 jours. La borne est appliquée par le
--  trigger : contourner le formulaire ne permet pas d'obtenir davantage.
-- -----------------------------------------------------------------------------
grant insert (expires_at) on public.ads to authenticated;

-- =============================================================================
-- 2. Contrôle automatique du contenu
-- =============================================================================
--  Détection volontairement étroite : uniquement des termes à signal fort,
--  dont plusieurs correspondent à des trafics réellement observés au Gabon
--  (ivoire, écailles de pangolin, faux documents). L'annonce n'est JAMAIS
--  refusée automatiquement — elle est mise en attente de revue humaine, ce qui
--  évite qu'un faux positif ne pénalise un vendeur légitime.
-- -----------------------------------------------------------------------------
create or replace function public.needs_manual_review(p_title text, p_description text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_text text;
  v_pattern text;
  -- Motifs recherchés sur le texte désaccentué et en minuscules.
  v_patterns constant text[] := array[
    -- Espèces protégées et braconnage
    'ivoire', 'defense d''elephant', 'ecaille[s]? de pangolin', 'pangolin',
    'peau de panthere', 'corne de rhino',
    -- Armes et munitions
    'arme a feu', 'kalachnikov', 'ak ?47', 'munition[s]?', 'pistolet automatique',
    -- Documents falsifiés
    'faux (papier|document|diplome|passeport|permis)', 'vrai faux',
    -- Stupéfiants
    'cannabis', 'chanvre indien', 'cocaine', 'stupefiant',
    -- Fraude financière
    'multiplication d''argent', 'rituel[s]? de richesse', 'transfert western union rapide'
  ];
begin
  v_text := lower(public.immutable_unaccent(coalesce(p_title, '') || ' ' || coalesce(p_description, '')));

  foreach v_pattern in array v_patterns loop
    if v_text ~ v_pattern then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

comment on function public.needs_manual_review(text, text) is
  'Détection étroite de contenus manifestement interdits. Route l''annonce vers une revue humaine, sans jamais la refuser automatiquement.';

-- =============================================================================
-- 3. Trigger d'annonce : bornes de durée, GPS arrondi, revue automatique
-- =============================================================================
--  Remplace la version de la migration 02 en y ajoutant trois traitements.
-- -----------------------------------------------------------------------------
create or replace function public.ads_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_expiry constant interval := interval '7 days';
  v_max_expiry constant interval := interval '90 days';
begin
  -- --- Champs privilégiés ---------------------------------------------------
  if tg_op = 'INSERT' and not public.is_staff() and auth.uid() is not null then
    new.is_featured      := false;
    new.featured_until   := null;
    new.views_count      := 0;
    new.favorites_count  := 0;
    new.messages_count   := 0;
    new.rejection_reason := null;
  end if;

  --  À l'UPDATE, on ne fige QUE l'identité de l'annonce. Ne jamais restaurer
  --  ici les compteurs ni is_featured : ils sont mis à jour par des fonctions
  --  SECURITY DEFINER qui s'exécutent dans la session de l'utilisateur.
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

  -- --- Coordonnées GPS ------------------------------------------------------
  --  Arrondi à trois décimales (~110 m) : suffisant pour situer un quartier,
  --  insuffisant pour désigner un domicile. Une annonce n'a pas à publier la
  --  position exacte de son auteur.
  if new.latitude is not null and new.longitude is not null then
    new.latitude  := round(new.latitude::numeric, 3);
    new.longitude := round(new.longitude::numeric, 3);
  else
    -- Une coordonnée seule n'a pas de sens : on repart de zéro.
    new.latitude  := null;
    new.longitude := null;
  end if;

  -- --- Recherche plein texte : titre > ville > description -------------------
  new.search_vector :=
      setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.title, ''))), 'A')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.city, ''))), 'B')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.district, ''))), 'B')
    || setweight(to_tsvector('french', public.immutable_unaccent(coalesce(new.description, ''))), 'C');

  -- --- Validation automatique du contenu ------------------------------------
  if new.status = 'published'
     and not public.is_staff()
     and public.needs_manual_review(new.title, new.description) then
    new.status := 'pending_review';
  end if;

  -- --- Dates de publication et d'expiration ---------------------------------
  if new.status = 'published' then
    if new.published_at is null then new.published_at := now(); end if;

    if new.expires_at is null then
      new.expires_at := now() + interval '60 days';

    elsif auth.uid() is not null
      and (tg_op = 'INSERT' or new.expires_at is distinct from old.expires_at)
    then
      -- Bornes appliquées côté base : le formulaire propose 30/60/90 jours,
      -- mais c'est ici que la limite est réellement tenue.
      --
      -- Deux garde-fous dans cette condition :
      --   * on ne borne que si la date est RÉELLEMENT modifiée — sans quoi la
      --     moindre correction de faute d'orthographe repousserait l'échéance
      --     de sept jours, offrant une reconduction perpétuelle ;
      --   * on ne borne que les écritures d'un utilisateur authentifié — la
      --     maintenance planifiée et le back-office (`service_role`) doivent
      --     pouvoir fixer librement une échéance, y compris dans le passé.
      --     Un visiteur anonyme n'écrit de toute façon jamais dans `ads` : la
      --     RLS exige `auth.uid() = seller_id`.
      new.expires_at := least(
        greatest(new.expires_at, now() + v_min_expiry),
        now() + v_max_expiry
      );
    end if;
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

-- =============================================================================
-- 4. AD_FEATURE_PLANS — tarifs de mise en avant
-- =============================================================================
--  Le tarif ne vient JAMAIS du client : le formulaire n'envoie qu'un code
--  d'offre, et la RPC lit le montant ici.
-- -----------------------------------------------------------------------------
create table if not exists public.ad_feature_plans (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[a-z0-9_]+$'),
  name        text not null,
  description text,
  duration_days integer not null check (duration_days between 1 and 90),
  price       bigint not null check (price >= 0),
  currency    text not null default 'XAF' check (currency = 'XAF'),
  is_active   boolean not null default true,
  "position"  integer not null default 0,
  created_at  timestamptz not null default now()
);

comment on table public.ad_feature_plans is
  'Tarifs de mise en avant d''une annonce. Lus côté serveur par request_ad_feature().';

insert into public.ad_feature_plans (code, name, description, duration_days, price, "position")
values
  ('boost_7',  'Une semaine',  'Votre annonce en tête des résultats pendant 7 jours.',   7,  2000, 10),
  ('boost_15', 'Deux semaines','Deux fois plus de visibilité, pendant 15 jours.',       15,  3500, 20),
  ('boost_30', 'Un mois',      'Visibilité maximale pendant 30 jours.',                 30,  6000, 30)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      duration_days = excluded.duration_days,
      price = excluded.price,
      "position" = excluded."position";

alter table public.ad_feature_plans enable row level security;

drop policy if exists ad_feature_plans_select_active on public.ad_feature_plans;
create policy ad_feature_plans_select_active
  on public.ad_feature_plans for select
  using (is_active or public.is_staff());

drop policy if exists ad_feature_plans_write_admin on public.ad_feature_plans;
create policy ad_feature_plans_write_admin
  on public.ad_feature_plans for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.ad_feature_plans from anon, authenticated;
grant select on public.ad_feature_plans to anon, authenticated;
grant insert, update, delete on public.ad_feature_plans to authenticated; -- RLS : admin

-- =============================================================================
-- 5. Demande de mise en avant
-- =============================================================================
--  Crée un paiement « en attente » pour l'annonce du demandeur. Le montant et
--  la durée viennent de `ad_feature_plans` : le client ne transmet qu'un code.
--  L'annonce ne devient `is_featured` qu'à la confirmation du paiement, par
--  `payments_after_update` (rôle service_role, callback opérateur).
-- -----------------------------------------------------------------------------
create or replace function public.request_ad_feature(
  p_ad_id       uuid,
  p_plan_code   text,
  p_provider    public.payment_provider default 'airtel_money',
  p_payer_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_plan    public.ad_feature_plans;
  v_phone   text;
  v_payment uuid;
begin
  if v_user is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;

  -- L'annonce doit appartenir au demandeur.
  if not exists (select 1 from public.ads where id = p_ad_id and seller_id = v_user) then
    raise exception 'Annonce introuvable.' using errcode = 'P0001';
  end if;

  select * into v_plan
    from public.ad_feature_plans
   where code = p_plan_code and is_active;

  if v_plan.id is null then
    raise exception 'Offre de mise en avant inconnue.' using errcode = 'P0001';
  end if;

  -- Pas deux demandes en cours pour la même annonce.
  if exists (
    select 1 from public.payments
     where ad_id = p_ad_id
       and purpose in ('ad_feature', 'ad_boost')
       and status in ('pending', 'processing')
  ) then
    raise exception 'Un paiement est déjà en cours pour cette annonce.' using errcode = 'P0001';
  end if;

  v_phone := public.to_e164_gabon(p_payer_phone);

  insert into public.payments (
    user_id, purpose, ad_id, provider, payer_phone, amount, status, metadata
  )
  values (
    v_user, 'ad_feature', p_ad_id, p_provider, v_phone,
    v_plan.price, 'pending',
    jsonb_build_object(
      'plan_code', v_plan.code,
      'duration_days', v_plan.duration_days,
      'plan_name', v_plan.name
    )
  )
  returning id into v_payment;

  return v_payment;
end;
$$;

-- =============================================================================
-- 6. Durée de mise en avant issue de l'offre payée
-- =============================================================================
--  Remplace la version de la migration 02, qui accordait 7 jours en dur.
-- -----------------------------------------------------------------------------
create or replace function public.payments_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.subscription_plans;
  v_days integer;
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

    -- Mise en avant : durée lue dans les métadonnées du paiement, à défaut 7 jours.
    if new.ad_id is not null and new.purpose in ('ad_feature', 'ad_boost') then
      v_days := coalesce((new.metadata ->> 'duration_days')::integer, 7);

      update public.ads
         set is_featured    = true,
             featured_until = greatest(coalesce(featured_until, now()), now())
                              + make_interval(days => v_days)
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

-- =============================================================================
-- 7. Droits d'exécution
-- =============================================================================
grant execute on function public.needs_manual_review(text, text) to anon, authenticated;
grant execute on function public.request_ad_feature(uuid, text, public.payment_provider, text)
  to authenticated;
