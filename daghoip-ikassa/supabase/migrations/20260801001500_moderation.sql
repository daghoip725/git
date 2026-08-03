-- =============================================================================
--  Daghoip Ikassa — 15. Modération : signalement de comptes, file de triage
-- =============================================================================
--  L'existant couvrait le signalement d'une **annonce**, la file par statut et
--  le changement de statut d'un compte. Trois manques concrets restaient :
--
--   1. **Signaler un compte** était impossible. La table le prévoyait
--      (`target_type = 'user'`), l'interface non — or l'arnaqueur type ne
--      publie pas une mauvaise annonce, il en publie dix correctes et démarche
--      en messagerie. C'est le compte qu'il faut pouvoir désigner, pas une
--      annonce en particulier.
--
--   2. **Aucune déduplication** sur les signalements de compte. L'unicité
--      n'existait que pour les annonces : un même utilisateur pouvait signaler
--      cinquante fois le même compte et noyer la file — soit par acharnement,
--      soit par simple double clic.
--
--   3. **Aucun ordre de priorité.** Un compte signalé par huit personnes
--      distinctes s'affichait comme un compte signalé une fois. C'est pourtant
--      la seule information qui permette à un modérateur de savoir par où
--      commencer.
--
--  Principe conservé de bout en bout : **rien n'est automatique**. Aucun compte
--  n'est bloqué par un compteur de signalements. Un signalement ouvre un
--  dossier, un humain tranche. Un mécanisme qui bannirait au bout de N
--  signalements offrirait à n'importe quel groupe coordonné le moyen de faire
--  taire un concurrent.
--
--  Idempotent : rejouable sans dommage.
-- =============================================================================

-- =============================================================================
-- 1. DÉDOUBLONNAGE DES SIGNALEMENTS DE COMPTE
-- =============================================================================
--  Le pendant de `reports_unique_ad_reporter_idx`, qui n'existait que pour les
--  annonces. Sans lui, la file de modération se remplit plus vite qu'elle ne se
--  vide, et les signalements légitimes se perdent dans le bruit.
create unique index if not exists reports_unique_user_reporter_idx
  on public.reports (target_user_id, reporter_id)
  where target_user_id is not null and reporter_id is not null;

-- Triage par cible : la file groupée s'appuie dessus.
create index if not exists reports_target_user_open_idx
  on public.reports (target_user_id, created_at desc)
  where status in ('open', 'reviewing') and target_user_id is not null;

-- =============================================================================
-- 2. SIGNALER UN COMPTE
-- =============================================================================
--  `security definer` pour trois raisons : vérifier que la cible existe sans
--  accorder de lecture supplémentaire, empêcher l'auto-signalement, et écrire
--  sans donner au client de droit d'INSERT libre sur `reports` — il pourrait
--  sinon forger un `reporter_id` ou un `status`.
create or replace function public.report_user(
  p_user_id uuid,
  p_reason  public.report_reason,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter uuid := auth.uid();
  v_target   public.users;
  v_id       uuid;
begin
  if v_reporter is null then
    raise exception 'Authentification requise.' using errcode = '42501';
  end if;
  if not public.is_active_account() then
    raise exception 'Votre compte ne permet pas cette opération.' using errcode = '42501';
  end if;

  if p_user_id = v_reporter then
    raise exception 'Vous ne pouvez pas vous signaler vous-même.' using errcode = 'P0001';
  end if;

  select * into v_target from public.users where id = p_user_id;
  if v_target.id is null or v_target.status = 'deleted' then
    raise exception 'Compte introuvable.' using errcode = 'P0001';
  end if;

  insert into public.reports (reporter_id, target_type, target_user_id, reason, details)
  values (v_reporter, 'user', p_user_id, p_reason, nullif(btrim(coalesce(p_details, '')), ''))
  -- Deuxième signalement du même compte par la même personne : on ne crée rien
  -- et on ne rouvre rien. Rouvrir un dossier clos en le re-signalant
  -- permettrait de contourner la décision d'un modérateur.
  on conflict (target_user_id, reporter_id)
    where target_user_id is not null and reporter_id is not null
  do nothing
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.report_user(uuid, public.report_reason, text) is
  'Signale un compte. Un signalement déjà déposé par la même personne n''en crée pas un second.';

-- =============================================================================
-- 3. FILE DE TRIAGE
-- =============================================================================
--  Regroupe les signalements ouverts **par cible** plutôt que de les lister à
--  plat. Trois chiffres suffisent à décider par où commencer :
--
--    • le nombre de **signaleurs distincts** — c'est le signal fort. Huit
--      personnes qui n'ont rien à voir entre elles pointent le même compte :
--      voilà un dossier. Huit signalements d'une seule personne, non ;
--    • l'**ancienneté** du plus vieux signalement, pour ne pas laisser un
--      dossier dormir ;
--    • les **motifs** invoqués, parce que « arnaque » et « mauvaise catégorie »
--      n'appellent pas la même urgence.
create or replace function public.moderation_queue(p_limit integer default 50)
returns table (
  target_type    public.report_target_type,
  target_id      uuid,
  target_label   text,
  target_href    text,
  /** Statut du compte visé, pour ne pas rouvrir un dossier déjà tranché. */
  target_status  public.account_status,
  report_count   integer,
  /** Signaleurs distincts : le seul chiffre qui vaille pour trier. */
  reporter_count integer,
  reasons        text[],
  first_reported timestamptz,
  last_reported  timestamptz
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
  with comptes as (
    select
      'user'::public.report_target_type as target_type,
      r.target_user_id as target_id,
      u.full_name      as target_label,
      '/vendeurs/' || u.id::text as target_href,
      u.status         as target_status,
      count(*)::integer as report_count,
      count(distinct r.reporter_id)::integer as reporter_count,
      array_agg(distinct r.reason::text) as reasons,
      min(r.created_at) as first_reported,
      max(r.created_at) as last_reported
    from public.reports r
    join public.users u on u.id = r.target_user_id
    where r.status in ('open', 'reviewing')
      and r.target_user_id is not null
    group by r.target_user_id, u.full_name, u.id, u.status
  ),
  annonces as (
    select
      'ad'::public.report_target_type,
      r.ad_id,
      a.title,
      '/annonces/' || a.slug || '-' || a.reference,
      -- Une annonce n'a pas de statut de compte : on remonte celui du vendeur,
      -- qui est l'information utile au modérateur.
      u.status,
      count(*)::integer,
      count(distinct r.reporter_id)::integer,
      array_agg(distinct r.reason::text),
      min(r.created_at),
      max(r.created_at)
    from public.reports r
    join public.ads a on a.id = r.ad_id
    join public.users u on u.id = a.seller_id
    where r.status in ('open', 'reviewing')
      and r.ad_id is not null
    group by r.ad_id, a.title, a.slug, a.reference, u.status
  )
  select * from (
    select * from comptes
    union all
    select * from annonces
  ) tout
  -- Signaleurs distincts d'abord : c'est la mesure qui résiste à l'acharnement.
  order by tout.reporter_count desc, tout.first_reported
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

comment on function public.moderation_queue(integer) is
  'File de triage groupée par cible, ordonnée par nombre de signaleurs distincts.';

-- =============================================================================
-- 4. CLÔTURE GROUPÉE
-- =============================================================================
--  Bloquer un compte signalé par huit personnes doit clore les huit dossiers.
--  Obliger un modérateur à cliquer huit fois après avoir tranché, c'est
--  garantir qu'il en oubliera — et que la file affichera longtemps un dossier
--  déjà traité.
create or replace function public.resolve_reports_for_target(
  p_target_type public.report_target_type,
  p_target_id   uuid,
  p_status      public.report_status default 'resolved',
  p_note        text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_staff() then
    raise exception 'Réservé au personnel de modération.' using errcode = '42501';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Statut de clôture invalide.' using errcode = 'P0001';
  end if;

  update public.reports
     set status          = p_status,
         resolved_by     = auth.uid(),
         resolved_at     = now(),
         resolution_note = left(p_note, 1000)
   where status in ('open', 'reviewing')
     and ((p_target_type = 'user' and target_user_id = p_target_id)
       or (p_target_type = 'ad'   and ad_id          = p_target_id));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.resolve_reports_for_target is
  'Clôt d''un geste tous les signalements ouverts visant une même cible.';

-- =============================================================================
-- 5. BLOCAGE D'UN COMPTE, DOSSIER COMPRIS
-- =============================================================================
--  Enchaîne le changement de statut et la clôture des signalements. Les deux
--  gestes vont toujours ensemble en pratique ; les laisser séparés revenait à
--  compter sur la discipline du modérateur pour que la file reste juste.
--
--  Toutes les protections de `admin_set_user_status` s'appliquent : on ne
--  sanctionne ni soi-même, ni un membre de l'équipe sans être administrateur.
create or replace function public.block_account(
  p_user_id uuid,
  p_status  public.account_status,
  p_reason  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_closed integer := 0;
begin
  if p_status not in ('suspended', 'banned', 'active') then
    raise exception 'Statut de compte invalide.' using errcode = 'P0001';
  end if;

  -- Délègue : garde de rôle, protection de soi et de la hiérarchie, retrait des
  -- annonces de la vitrine et journalisation d'audit y sont déjà.
  perform public.admin_set_user_status(p_user_id, p_status, p_reason);

  if p_status in ('suspended', 'banned') then
    v_closed := public.resolve_reports_for_target(
      'user', p_user_id, 'resolved',
      coalesce(p_reason, 'Compte sanctionné à la suite de ce signalement.')
    );
  end if;

  return v_closed;
end;
$$;

comment on function public.block_account(uuid, public.account_status, text) is
  'Sanctionne un compte et clôt les signalements qui le visent. Jamais automatique : appelé par un modérateur.';

-- =============================================================================
-- 6. DOSSIER D'UN COMPTE
-- =============================================================================
--  Ce qu'un modérateur a besoin de voir avant de trancher : depuis quand le
--  compte existe, ce qu'il a publié, ce qu'on lui reproche — et **combien de
--  fois il a lui-même signalé les autres**, parce qu'un signaleur compulsif
--  dont les dossiers sont systématiquement rejetés est un signal en soi.
create or replace function public.account_dossier(p_user_id uuid)
returns table (
  full_name        text,
  status           public.account_status,
  role             public.user_role,
  is_verified      boolean,
  created_at       timestamptz,
  ads_total        integer,
  ads_published    integer,
  reports_received integer,
  reporters_distinct integer,
  reports_filed    integer,
  reports_filed_dismissed integer
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
  select
    u.full_name,
    u.status,
    u.role,
    u.is_verified,
    u.created_at,
    (select count(*)::integer from public.ads a where a.seller_id = u.id),
    (select count(*)::integer from public.ads a
      where a.seller_id = u.id and a.status = 'published'),
    (select count(*)::integer from public.reports r where r.target_user_id = u.id),
    (select count(distinct r.reporter_id)::integer from public.reports r
      where r.target_user_id = u.id),
    (select count(*)::integer from public.reports r where r.reporter_id = u.id),
    (select count(*)::integer from public.reports r
      where r.reporter_id = u.id and r.status = 'dismissed')
  from public.users u
  where u.id = p_user_id;
end;
$$;

comment on function public.account_dossier(uuid) is
  'Éléments de contexte avant décision de modération, signalements émis compris.';

-- =============================================================================
-- 7. PRIVILÈGES
-- =============================================================================
grant execute on function public.report_user(uuid, public.report_reason, text) to authenticated;

--  Les fonctions de modération vérifient `is_staff()` en première ligne : le
--  droit d'exécution ne suffit pas à s'en servir.
grant execute on function public.moderation_queue(integer)              to authenticated;
grant execute on function public.account_dossier(uuid)                  to authenticated;
grant execute on function public.block_account(uuid, public.account_status, text)
  to authenticated;
grant execute on function public.resolve_reports_for_target(
  public.report_target_type, uuid, public.report_status, text
) to authenticated;
