-- =============================================================================
--  Tests de la messagerie : blocage, pièces jointes, recherche, accusés, archivage
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

/** Exécute une instruction en tant qu'utilisateur donné et dit si elle échoue. */
create or replace function pg_temp.fails_as(p_user uuid, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;

-- Trois comptes : un vendeur, un acheteur, un tiers.
insert into auth.users (id, email, raw_user_meta_data) values
  ('d0000000-0000-0000-0000-000000000001', 'vendeur@test.ga',   '{"full_name":"Alice Mabika"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000002', 'acheteur@test.ga',  '{"full_name":"Brice Ondo"}'::jsonb),
  ('d0000000-0000-0000-0000-000000000003', 'tiers@test.ga',     '{"full_name":"Chantal Nze"}'::jsonb);

-- Deux annonces de la vendeuse, dont une Toyota (pour la recherche par titre).
do $$
declare v_cat uuid;
begin
  select id into v_cat from public.categories where slug = 'divers';

  insert into public.ads (id, seller_id, category_id, title, description, price, city, contact_phone)
  values
    ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-000000000001', v_cat,
     'Toyota RAV4 2018', 'Description suffisamment longue pour satisfaire la contrainte de longueur.',
     9000000, 'Libreville', '+2416123456'),
    ('d0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-000000000001', v_cat,
     'Canapé trois places', 'Description suffisamment longue pour satisfaire la contrainte de longueur.',
     150000, 'Libreville', '+2416123456');
end $$;

-- ---------------------------------------------------------------------------
-- 1. Fil de discussion et accusés de lecture
-- ---------------------------------------------------------------------------
\echo '--- 1. Fil et accusés de lecture ---'

do $$
declare v_conv uuid; v_count integer; v_read timestamptz;
begin
  -- L'acheteur ouvre le fil et écrit.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  v_conv := public.get_or_create_conversation('d0000000-0000-0000-0000-0000000000a1');
  perform public.send_message(v_conv, 'Bonjour, la Toyota est-elle toujours disponible ?');
  reset role;

  perform pg_temp.check('conversation créée', v_conv is not null);

  select seller_unread_count into v_count from public.conversations where id = v_conv;
  perform pg_temp.check('un non-lu côté vendeuse', v_count = 1);

  select read_at into v_read from public.messages where conversation_id = v_conv limit 1;
  perform pg_temp.check('message non lu à l''envoi', v_read is null);

  -- La vendeuse ouvre le fil.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  v_count := public.mark_conversation_read(v_conv);
  reset role;

  perform pg_temp.check('un message marqué lu', v_count = 1);

  select read_at into v_read from public.messages where conversation_id = v_conv limit 1;
  perform pg_temp.check('accusé de lecture horodaté', v_read is not null);

  select seller_unread_count into v_count from public.conversations where id = v_conv;
  perform pg_temp.check('compteur de non-lus remis à zéro', v_count = 0);

  -- Un accusé de lecture ne se pose jamais sur ses propres messages.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  perform public.send_message(v_conv, 'Bonjour Brice, oui elle est disponible.');
  v_count := public.mark_conversation_read(v_conv);
  reset role;

  perform pg_temp.check('marquer comme lu n''affecte pas ses propres messages', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 2. Pièces jointes
-- ---------------------------------------------------------------------------
\echo '--- 2. Photos ---'

do $$
declare v_conv uuid; v_other uuid; v_id uuid; v_blocked boolean;
begin
  select id into v_conv from public.conversations
   where ad_id = 'd0000000-0000-0000-0000-0000000000a1';

  -- Fil sur la seconde annonce, pour tester le cloisonnement des chemins.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  v_other := public.get_or_create_conversation('d0000000-0000-0000-0000-0000000000a2');

  -- Chemin conforme : <expéditeur>/<conversation>/<fichier>
  v_id := public.send_message(
    v_conv, 'Voici une photo',
    'd0000000-0000-0000-0000-000000000002/' || v_conv::text || '/photo.jpg');
  reset role;

  perform pg_temp.check('message avec pièce jointe accepté', v_id is not null);

  -- Photo seule, sans texte.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  v_id := public.send_message(
    v_conv, '',
    'd0000000-0000-0000-0000-000000000002/' || v_conv::text || '/photo2.jpg');
  reset role;

  perform pg_temp.check('message sans texte mais avec photo accepté', v_id is not null);

  -- Message entièrement vide : refusé par la contrainte.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    format('select public.send_message(%L, %L)', v_conv, '   '));
  reset role;
  perform pg_temp.check('message vide REFUSÉ', v_blocked);

  -- Pièce jointe déposée dans le dossier de quelqu'un d'autre.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    format('select public.send_message(%L, %L, %L)', v_conv, 'Tiens',
           'd0000000-0000-0000-0000-000000000001/' || v_conv::text || '/vol.jpg'));
  reset role;
  perform pg_temp.check('pièce jointe au nom d''autrui REFUSÉE', v_blocked);

  -- Pièce jointe rattachée à une autre conversation.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    format('select public.send_message(%L, %L, %L)', v_conv, 'Tiens',
           'd0000000-0000-0000-0000-000000000002/' || v_other::text || '/ailleurs.jpg'));
  reset role;
  perform pg_temp.check('pièce jointe d''une autre conversation REFUSÉE', v_blocked);
end $$;

-- ---------------------------------------------------------------------------
-- 3. Blocage
-- ---------------------------------------------------------------------------
\echo '--- 3. Blocage ---'

do $$
declare v_conv uuid; v_blocked boolean; v_archived boolean; v_count integer;
begin
  select id into v_conv from public.conversations
   where ad_id = 'd0000000-0000-0000-0000-0000000000a1';

  -- La vendeuse bloque l'acheteur.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  perform public.block_user('d0000000-0000-0000-0000-000000000002', 'Insistant');
  reset role;

  perform pg_temp.check('blocage enregistré',
    public.is_blocked_between('d0000000-0000-0000-0000-000000000001',
                              'd0000000-0000-0000-0000-000000000002'));

  perform pg_temp.check('le blocage vaut dans les deux sens pour la messagerie',
    public.is_blocked_between('d0000000-0000-0000-0000-000000000002',
                              'd0000000-0000-0000-0000-000000000001'));

  select seller_archived into v_archived from public.conversations where id = v_conv;
  perform pg_temp.check('le fil est archivé du côté de celui qui bloque', v_archived);

  -- La personne bloquée ne peut plus écrire…
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    format('select public.send_message(%L, %L)', v_conv, 'Vous êtes là ?'));
  reset role;
  perform pg_temp.check('la personne bloquée ne peut plus écrire', v_blocked);

  -- … ni celle qui a bloqué : le blocage coupe le fil, pas seulement l'entrant.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000001',
    format('select public.send_message(%L, %L)', v_conv, 'Bonjour'));
  reset role;
  perform pg_temp.check('celle qui bloque ne peut plus écrire non plus', v_blocked);

  -- L'insertion directe est refusée elle aussi : le contrôle est dans un
  -- trigger, pas seulement dans la RPC.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    format('insert into public.messages (conversation_id, sender_id, body) values (%L, %L, %L)',
           v_conv, 'd0000000-0000-0000-0000-000000000002', 'Contournement'));
  reset role;
  perform pg_temp.check('insertion directe dans messages REFUSÉE aussi', v_blocked);

  -- Ouvrir un nouveau fil avec la même personne est refusé.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000002',
    'select public.get_or_create_conversation(''d0000000-0000-0000-0000-0000000000a2'')');
  reset role;
  perform pg_temp.check('ouverture d''un nouveau fil REFUSÉE', v_blocked);

  -- La personne bloquée ne doit pas pouvoir constater le blocage.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  select count(*) into v_count from public.blocked_users;
  reset role;
  perform pg_temp.check('la personne bloquée ne voit aucun blocage', v_count = 0);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  select count(*) into v_count from public.list_blocked_users();
  reset role;
  perform pg_temp.check('celle qui bloque voit son blocage', v_count = 1);

  -- Un tiers n'est pas concerné.
  perform pg_temp.check('un tiers n''est pas affecté',
    not public.is_blocked_between('d0000000-0000-0000-0000-000000000003',
                                  'd0000000-0000-0000-0000-000000000002'));

  -- Se bloquer soi-même n'a pas de sens.
  set local role authenticated;
  v_blocked := pg_temp.fails_as('d0000000-0000-0000-0000-000000000001',
    'select public.block_user(''d0000000-0000-0000-0000-000000000001'')');
  reset role;
  perform pg_temp.check('auto-blocage REFUSÉ', v_blocked);

  -- Déblocage : tout redevient possible.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  perform public.unblock_user('d0000000-0000-0000-0000-000000000002');
  perform public.send_message(v_conv, 'Excusez-moi, reprenons.');
  reset role;

  perform pg_temp.check('blocage levé',
    not public.is_blocked_between('d0000000-0000-0000-0000-000000000001',
                                  'd0000000-0000-0000-0000-000000000002'));

  select seller_archived into v_archived from public.conversations where id = v_conv;
  perform pg_temp.check('un nouveau message désarchive le fil', not v_archived);
end $$;

-- ---------------------------------------------------------------------------
-- 4. Recherche dans les conversations
-- ---------------------------------------------------------------------------
\echo '--- 4. Recherche ---'

do $$
declare v_count integer; v_type text; v_excerpt text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);

  -- Par contenu de message.
  select count(*) into v_count from public.search_conversations('disponible') s;
  perform pg_temp.check('recherche par contenu de message', v_count = 1);

  select s.match_type, s.match_excerpt into v_type, v_excerpt
    from public.search_conversations('disponible') s;
  perform pg_temp.check('origine de la correspondance : message', v_type = 'message');
  perform pg_temp.check('extrait du message renvoyé', v_excerpt like '%disponible%');

  -- Par titre d'annonce, alors que le mot n'est dans aucun message.
  select count(*) into v_count from public.search_conversations('canapé') s;
  perform pg_temp.check('recherche par titre d''annonce', v_count = 1);

  select s.match_type into v_type from public.search_conversations('canapé') s;
  perform pg_temp.check('origine de la correspondance : annonce', v_type = 'annonce');

  -- Insensibilité aux accents et à la casse.
  select count(*) into v_count from public.search_conversations('CANAPE') s;
  perform pg_temp.check('recherche insensible aux accents et à la casse', v_count = 1);

  -- Par nom du correspondant.
  select count(*) into v_count from public.search_conversations('Alice') s;
  perform pg_temp.check('recherche par nom du correspondant', v_count = 2);

  -- Requête vide : aucun résultat plutôt que tout.
  select count(*) into v_count from public.search_conversations('   ') s;
  perform pg_temp.check('requête vide : aucun résultat', v_count = 0);

  select count(*) into v_count from public.search_conversations('introuvable') s;
  perform pg_temp.check('terme absent : aucun résultat', v_count = 0);
  reset role;

  -- Un tiers ne voit rien de ces conversations.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000003', true);
  select count(*) into v_count from public.search_conversations('disponible') s;
  reset role;
  perform pg_temp.check('un tiers ne trouve AUCUNE conversation d''autrui', v_count = 0);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Archivage
-- ---------------------------------------------------------------------------
\echo '--- 5. Archivage ---'

do $$
declare v_conv uuid; v_buyer boolean; v_seller boolean;
begin
  select id into v_conv from public.conversations
   where ad_id = 'd0000000-0000-0000-0000-0000000000a1';

  -- Chacun archive de son côté.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000002', true);
  update public.conversations set buyer_archived = true where id = v_conv;
  reset role;

  select buyer_archived, seller_archived into v_buyer, v_seller
    from public.conversations where id = v_conv;
  perform pg_temp.check('archivage acheteur enregistré', v_buyer);
  perform pg_temp.check('archivage acheteur sans effet sur la vendeuse', not v_seller);

  -- Un nouveau message ramène le fil dans la boîte des deux parties.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-000000000001', true);
  perform public.send_message(v_conv, 'Une dernière chose…');
  reset role;

  select buyer_archived into v_buyer from public.conversations where id = v_conv;
  perform pg_temp.check('un nouveau message désarchive des deux côtés', not v_buyer);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Notifications
-- ---------------------------------------------------------------------------
\echo '--- 6. Notifications ---'

do $$
declare v_count integer; v_link text;
begin
  select count(*) into v_count
    from public.notifications
   where user_id = 'd0000000-0000-0000-0000-000000000001' and type = 'new_message';
  perform pg_temp.check('la vendeuse a été notifiée', v_count > 0);

  select link into v_link
    from public.notifications
   where user_id = 'd0000000-0000-0000-0000-000000000001' and type = 'new_message'
   limit 1;
  perform pg_temp.check('la notification pointe vers le fil', v_link like '/messages/%');

  -- Personne n'est notifié de ses propres messages.
  select count(*) into v_count
    from public.notifications n
    join public.messages m on m.id::text = n.data->>'message_id'
   where n.user_id = m.sender_id;
  perform pg_temp.check('aucune auto-notification', v_count = 0);
end $$;

\echo ''
\echo '  TESTS MESSAGERIE : TOUS PASSÉS'
