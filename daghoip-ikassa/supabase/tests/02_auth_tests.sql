-- =============================================================================
--  Tests d'authentification, de rôles et de vérification vendeur
-- =============================================================================
--  À exécuter sur une base fraîche, APRÈS les migrations et le seed.
-- =============================================================================
\set ON_ERROR_STOP on
\pset pager off
\pset tuples_only on

create or replace function pg_temp.check(p_label text, p_ok boolean)
returns void language plpgsql as $$
begin
  if p_ok then
    raise notice '  OK   %', p_label;
  else
    raise exception 'ECHEC : %', p_label;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Normalisation E.164 des numéros gabonais
-- ---------------------------------------------------------------------------
\echo '--- 1. Format E.164 ---'

do $$ begin
  perform pg_temp.check('saisie locale « 06 12 34 56 » → +2416123456',
    public.to_e164_gabon('06 12 34 56') = '+2416123456');

  perform pg_temp.check('saisie « 074 12 34 56 » → +24174123456',
    public.to_e164_gabon('074 12 34 56') = '+24174123456');

  perform pg_temp.check('le zéro national est retiré (E.164 valide)',
    public.to_e164_gabon('06 12 34 56') !~ '^\+2410');

  perform pg_temp.check('format international « +241 6123456 » accepté',
    public.to_e164_gabon('+241 6123456') = '+2416123456');

  perform pg_temp.check('préfixe « 00241 » accepté',
    public.to_e164_gabon('002416123456') = '+2416123456');

  perform pg_temp.check('numéro trop court refusé',
    public.to_e164_gabon('0612') is null);

  perform pg_temp.check('numéro trop long refusé',
    public.to_e164_gabon('06123456789012') is null);

  perform pg_temp.check('chaîne vide → null',
    public.to_e164_gabon('') is null);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Inscription : les quatre fournisseurs
-- ---------------------------------------------------------------------------
\echo '--- 2. Inscription multi-fournisseurs ---'

-- 2a. E-mail + mot de passe
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values ('a0000000-0000-0000-0000-000000000001', 'email@test.ga',
        '{"full_name":"Marie Ndong","phone":"06 12 34 56","city":"Libreville"}'::jsonb,
        '{"provider":"email"}'::jsonb);

do $$ begin
  perform pg_temp.check('inscription e-mail : profil créé avec nom et téléphone E.164',
    (select full_name = 'Marie Ndong' and phone = '+2416123456' and auth_provider = 'email'
       from public.users where id = 'a0000000-0000-0000-0000-000000000001'));
end $$;

-- 2b. Google (métadonnées OAuth : `name`, pas `full_name`)
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data, raw_app_meta_data)
values ('a0000000-0000-0000-0000-000000000002', 'google@test.ga', now(),
        '{"name":"Paul Obame","avatar_url":"https://lh3.googleusercontent.com/x"}'::jsonb,
        '{"provider":"google"}'::jsonb);

do $$ begin
  perform pg_temp.check('inscription Google : nom repris depuis « name »',
    (select full_name = 'Paul Obame' and auth_provider = 'google'
       from public.users where id = 'a0000000-0000-0000-0000-000000000002'));

  perform pg_temp.check('e-mail marqué vérifié par le fournisseur OAuth',
    (select email_verified from public.users where id = 'a0000000-0000-0000-0000-000000000002'));

  perform pg_temp.check('avatar tiers volontairement NON repris (CSP + vie privée)',
    (select avatar_path is null from public.users
      where id = 'a0000000-0000-0000-0000-000000000002'));
end $$;

-- 2c. Facebook (given_name + family_name)
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data)
values ('a0000000-0000-0000-0000-000000000003', 'fb@test.ga',
        '{"given_name":"Sylvie","family_name":"Mba"}'::jsonb,
        '{"provider":"facebook"}'::jsonb);

do $$ begin
  perform pg_temp.check('inscription Facebook : prénom + nom recomposés',
    (select full_name = 'Sylvie Mba' and auth_provider = 'facebook'
       from public.users where id = 'a0000000-0000-0000-0000-000000000003'));
end $$;

-- 2d. Téléphone (OTP SMS) — Supabase stocke le numéro sans « + »
insert into auth.users (id, phone, phone_confirmed_at, raw_app_meta_data)
values ('a0000000-0000-0000-0000-000000000004', '2417712345', now(),
        '{"provider":"phone"}'::jsonb);

do $$ begin
  perform pg_temp.check('inscription par téléphone : numéro repassé en E.164',
    (select phone = '+2417712345' and phone_verified and auth_provider = 'phone'
       from public.users where id = 'a0000000-0000-0000-0000-000000000004'));

  perform pg_temp.check('nom de repli attribué en l’absence d’e-mail',
    (select full_name = 'Utilisateur' from public.users
      where id = 'a0000000-0000-0000-0000-000000000004'));
end $$;

-- 2e. Un numéro déjà pris ne fait pas échouer l'inscription
insert into auth.users (id, email, raw_user_meta_data)
values ('a0000000-0000-0000-0000-000000000005', 'doublon@test.ga',
        '{"full_name":"Jean Doublon","phone":"06 12 34 56"}'::jsonb);

do $$ begin
  perform pg_temp.check('numéro déjà rattaché : compte créé quand même, sans téléphone',
    (select full_name = 'Jean Doublon' and phone is null
       from public.users where id = 'a0000000-0000-0000-0000-000000000005'));
end $$;

-- ---------------------------------------------------------------------------
-- 3. Confirmations différées (e-mail, téléphone)
-- ---------------------------------------------------------------------------
\echo '--- 3. Confirmations ---'

do $$ begin
  perform pg_temp.check('e-mail non confirmé au départ',
    (select not email_verified from public.users
      where id = 'a0000000-0000-0000-0000-000000000001'));
end $$;

update auth.users set email_confirmed_at = now()
 where id = 'a0000000-0000-0000-0000-000000000001';

do $$ begin
  perform pg_temp.check('confirmation d’e-mail répercutée sur public.users',
    (select email_verified from public.users
      where id = 'a0000000-0000-0000-0000-000000000001'));
end $$;

update auth.users set phone = '2416600001', phone_confirmed_at = now()
 where id = 'a0000000-0000-0000-0000-000000000002';

do $$ begin
  perform pg_temp.check('ajout d’un téléphone confirmé après coup',
    (select phone = '+2416600001' and phone_verified
       from public.users where id = 'a0000000-0000-0000-0000-000000000002'));
end $$;

-- Un numéro déjà rattaché à un autre compte n'est pas volé
update auth.users set phone = '2416123456', phone_confirmed_at = now()
 where id = 'a0000000-0000-0000-0000-000000000003';

do $$ begin
  perform pg_temp.check('numéro déjà pris : non transféré au second compte',
    (select phone is null from public.users
      where id = 'a0000000-0000-0000-0000-000000000003'));
  perform pg_temp.check('le titulaire d’origine conserve son numéro',
    (select phone = '+2416123456' from public.users
      where id = 'a0000000-0000-0000-0000-000000000001'));
end $$;

-- ---------------------------------------------------------------------------
-- 4. Rôles : promotion et garde-fous
-- ---------------------------------------------------------------------------
\echo '--- 4. Gestion des rôles ---'

-- Premier administrateur, posé hors application (bootstrap).
update public.users set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000001';

do $$ begin
  perform pg_temp.check('tout nouveau compte démarre avec le rôle « user »',
    (select role = 'user' from public.users where id = 'a0000000-0000-0000-0000-000000000002'));
end $$;

-- 4a. Un utilisateur ordinaire ne peut pas promouvoir qui que ce soit
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
    perform public.admin_set_user_role('a0000000-0000-0000-0000-000000000003', 'admin');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('promotion par un utilisateur ordinaire REFUSÉE', v_blocked);
end $$;

-- 4b. L'administrateur promeut un modérateur
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  perform public.admin_set_user_role('a0000000-0000-0000-0000-000000000002', 'moderator');
  reset role;

  perform pg_temp.check('un administrateur peut promouvoir un modérateur',
    (select role = 'moderator' from public.users
      where id = 'a0000000-0000-0000-0000-000000000002'));
  perform pg_temp.check('changement de rôle journalisé dans l’audit',
    (select count(*) = 1 from public.auth_audit_log
      where action = 'role_changed'
        and target_user_id = 'a0000000-0000-0000-0000-000000000002'));
  perform pg_temp.check('l’intéressé est notifié de son changement de droits',
    (select count(*) >= 1 from public.notifications
      where user_id = 'a0000000-0000-0000-0000-000000000002' and type = 'system'));
end $$;

-- 4c. Un modérateur ne peut pas promouvoir (réservé aux administrateurs)
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
    perform public.admin_set_user_role('a0000000-0000-0000-0000-000000000003', 'moderator');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('promotion par un modérateur REFUSÉE (admin seulement)', v_blocked);
end $$;

-- 4d. Un administrateur ne modifie pas son propre rôle
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
    perform public.admin_set_user_role('a0000000-0000-0000-0000-000000000001', 'user');
  exception when raise_exception then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('auto-modification de son rôle REFUSÉE (anti-verrouillage)', v_blocked);
end $$;

-- 4e. Le dernier administrateur ne peut pas être rétrogradé
do $$
declare v_blocked boolean := false;
begin
  -- On promeut un second administrateur puis on le fait rétrograder le premier.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
  perform public.admin_set_user_role('a0000000-0000-0000-0000-000000000003', 'admin');
  reset role;

  -- Le second retire les droits du premier : autorisé, il en reste un.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
  perform public.admin_set_user_role('a0000000-0000-0000-0000-000000000001', 'user');

  -- Il ne reste qu'un administrateur : impossible de le rétrograder.
  begin
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
    reset role;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
    perform public.admin_set_user_role('a0000000-0000-0000-0000-000000000003', 'user');
  exception when raise_exception then
    v_blocked := true;
  end;
  reset role;

  perform pg_temp.check('rétrogradation du DERNIER administrateur REFUSÉE', v_blocked);
end $$;

-- Remise en place : 000003 reste l'administrateur de référence.
\echo '--- 5. Statut de compte ---'

-- 5a. Un modérateur suspend un utilisateur ordinaire
do $$
declare v_ad uuid; v_cat uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';
  insert into public.ads (seller_id, category_id, title, description, price, city, contact_phone)
  values ('a0000000-0000-0000-0000-000000000004', v_cat, 'Annonce du compte suspendu',
          'Description suffisamment longue pour satisfaire la contrainte de longueur.',
          10000, 'Libreville', '+2416123456')
  returning id into v_ad;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  perform public.admin_set_user_status('a0000000-0000-0000-0000-000000000004', 'suspended',
                                       'Annonces frauduleuses');
  reset role;

  perform pg_temp.check('un modérateur peut suspendre un utilisateur',
    (select status = 'suspended' from public.users
      where id = 'a0000000-0000-0000-0000-000000000004'));
  perform pg_temp.check('les annonces du compte suspendu sont retirées de la vitrine',
    (select status = 'archived' from public.ads where id = v_ad));
  perform pg_temp.check('suspension journalisée',
    (select count(*) = 1 from public.auth_audit_log
      where action = 'status_changed'
        and target_user_id = 'a0000000-0000-0000-0000-000000000004'));
end $$;

-- 5b. Un compte suspendu ne peut plus publier
do $$
declare v_blocked boolean := false; v_cat uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
    insert into public.ads (seller_id, category_id, title, description, price, city, contact_phone)
    values ('a0000000-0000-0000-0000-000000000004', v_cat, 'Nouvelle tentative de publication',
            'Description suffisamment longue pour satisfaire la contrainte de longueur.',
            10000, 'Libreville', '+2416123456');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('publication par un compte suspendu REFUSÉE', v_blocked);
end $$;

-- 5c. Un modérateur ne peut pas sanctionner un autre membre de l'équipe
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
    perform public.admin_set_user_status('a0000000-0000-0000-0000-000000000003', 'banned');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('sanction d’un membre du staff par un modérateur REFUSÉE', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Badge vendeur vérifié
-- ---------------------------------------------------------------------------
\echo '--- 6. Vérification vendeur ---'

-- 6a. Dépôt d'une demande
do $$
declare v_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', true);
  select public.request_verification(
    'Jean Doublon Mbadinga', '06 55 44 33',
    'a0000000-0000-0000-0000-000000000005/cni.jpg',
    'Boutique Mbadinga', 'RCCM-LBV-2024-B-1234',
    'a0000000-0000-0000-0000-000000000005/rccm.pdf'
  ) into v_id;
  reset role;

  perform pg_temp.check('demande de vérification enregistrée', v_id is not null);
  -- « 06 55 44 33 » → chiffres « 06554433 » → zéro retiré → « 6554433 »
  perform pg_temp.check('téléphone de contact normalisé en E.164',
    (select contact_phone = '+2416554433' from public.verification_requests where id = v_id));
  perform pg_temp.check('demande tracée dans l’audit',
    (select count(*) = 1 from public.auth_audit_log
      where action = 'verification_requested'
        and target_user_id = 'a0000000-0000-0000-0000-000000000005'));
end $$;

-- 6b. Une pièce déposée dans le dossier d'autrui est refusée
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
    perform public.request_verification(
      'Usurpateur', '06 11 22 33',
      'a0000000-0000-0000-0000-000000000005/cni.jpg'  -- dossier d'un autre
    );
  exception when raise_exception or insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('pièce pointant le dossier d’autrui REFUSÉE', v_blocked);
end $$;

-- 6c. Un utilisateur ne peut pas s'attribuer le badge lui-même
do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', true);
    update public.users set is_verified = true
     where id = 'a0000000-0000-0000-0000-000000000005';
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('auto-attribution du badge vérifié REFUSÉE', v_blocked);
end $$;

-- 6d. Un utilisateur ordinaire ne peut pas instruire une demande
do $$
declare v_blocked boolean := false; v_req uuid;
begin
  select id into v_req from public.verification_requests where status = 'pending' limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
    perform public.review_verification(v_req, true);
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('instruction d’une demande par un non-staff REFUSÉE', v_blocked);
end $$;

-- 6e. Un modérateur approuve : le badge est posé
do $$
declare v_req uuid;
begin
  select id into v_req from public.verification_requests where status = 'pending' limit 1;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  perform public.review_verification(v_req, true);
  reset role;

  perform pg_temp.check('demande approuvée par le modérateur',
    (select status = 'approved' and reviewed_by is not null and reviewed_at is not null
       from public.verification_requests where id = v_req));
  perform pg_temp.check('badge « vérifié » posé sur le compte',
    (select is_verified from public.users
      where id = 'a0000000-0000-0000-0000-000000000005'));
  perform pg_temp.check('passage automatique en compte professionnel',
    (select is_professional and business_name = 'Boutique Mbadinga'
       from public.users where id = 'a0000000-0000-0000-0000-000000000005'));
  perform pg_temp.check('approbation journalisée',
    (select count(*) = 1 from public.auth_audit_log where action = 'verification_approved'));
  perform pg_temp.check('vendeur notifié de sa vérification',
    (select count(*) >= 1 from public.notifications
      where user_id = 'a0000000-0000-0000-0000-000000000005' and type = 'system'));
end $$;

-- 6f. Une demande déjà instruite ne peut pas l'être deux fois
do $$
declare v_blocked boolean := false; v_req uuid;
begin
  select id into v_req from public.verification_requests where status = 'approved' limit 1;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
    perform public.review_verification(v_req, false, 'Changement d’avis');
  exception when raise_exception then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('double instruction d’une demande REFUSÉE', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 7. Journal d'audit
-- ---------------------------------------------------------------------------
\echo '--- 7. Audit ---'

do $$
declare v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
  select count(*) into v_count from public.auth_audit_log;
  reset role;
  perform pg_temp.check('un utilisateur ordinaire ne lit PAS le journal d’audit', v_count = 0);
end $$;

do $$
declare v_count integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
  select count(*) into v_count from public.auth_audit_log;
  reset role;
  perform pg_temp.check('le staff lit le journal d’audit', v_count > 0);
end $$;

do $$
declare v_blocked boolean := false;
begin
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
    insert into public.auth_audit_log (action, target_user_id)
    values ('role_changed', 'a0000000-0000-0000-0000-000000000004');
  exception when insufficient_privilege then
    v_blocked := true;
  end;
  reset role;
  perform pg_temp.check('écriture directe dans le journal d’audit REFUSÉE (immuable)', v_blocked);
end $$;

\echo ''
\echo '============================================'
\echo '  TESTS AUTH : TOUS PASSÉS'
\echo '============================================'
