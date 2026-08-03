-- =============================================================================
--  17. PARAMÈTRES DU COMPTE — langue et suppression
-- =============================================================================
--  Deux réglages sans rapport apparent, réunis parce qu'ils touchent la même
--  table et le même écran : la langue d'interface, et le droit de partir.
--
--  Le second est de loin le plus délicat. « Supprimer le compte » ne peut pas
--  se traduire par un `delete from public.users` : la base l'interdit, et elle
--  a raison de l'interdire. Trois obstacles, tous légitimes :
--
--   1. `payments.user_id` est en `on delete restrict` — la suppression est
--      purement et simplement bloquée dès qu'un règlement existe. C'est voulu :
--      une pièce comptable ne s'efface pas à la demande du payeur.
--   2. `messages.sender_id` est en `on delete cascade` — un effacement
--      viderait les fils de discussion **des autres**, qui se retrouveraient
--      avec des conversations à sens unique. Les messages reçus par autrui ne
--      nous appartiennent plus.
--   3. `reviews.reviewer_id` est en `on delete cascade` — les avis déposés
--      disparaîtraient, et la note moyenne d'autres vendeurs changerait en
--      silence. Partir ne doit pas permettre de réécrire la réputation
--      d'autrui.
--
--  D'où le choix retenu : **anonymisation irréversible**. Tout ce qui désigne
--  la personne est effacé ou neutralisé ; ce qui appartient à la relation avec
--  autrui, ou à la comptabilité, reste — mais détaché de toute identité.
-- =============================================================================

-- =============================================================================
-- 1. LANGUE D'INTERFACE
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_language') then
    /*
     * Français d'abord : c'est la langue des affaires au Gabon, et elle le
     * reste. L'anglais vient ensuite — la communauté d'affaires régionale et
     * expatriée n'est pas marginale à Libreville et à Port-Gentil.
     *
     * Un enum et non un `text` libre : la langue pilote le rendu, une valeur
     * inattendue s'y traduirait par une interface vide. Ajouter une langue
     * demandera une migration, ce qui est exactement le bon niveau de
     * cérémonie — il faudra de toute façon fournir les traductions.
     */
    create type public.app_language as enum ('fr', 'en');
  end if;
end
$$;

alter table public.users
  add column if not exists language public.app_language not null default 'fr';

comment on column public.users.language is
  'Langue d''interface choisie. Hors du GRANT SELECT public : une préférence ne regarde personne d''autre.';

/*
 * Écriture autorisée au propriétaire, lecture **non** ajoutée au `grant select`
 * public. Le compte lit sa propre préférence par `get_my_profile()`, comme il
 * lit déjà son téléphone : la colonne n'a aucune raison de voyager avec les
 * profils publics.
 */
grant update (language) on public.users to authenticated;

-- =============================================================================
-- 2. SUPPRESSION DU COMPTE
-- =============================================================================

/**
 * Anonymise définitivement le compte courant.
 *
 * `security definer` — troisième cas de la convention (écriture destinée à
 * d'autres tables que celles du client) : la fonction écrit `users.status`,
 * hors du `GRANT UPDATE`, purge plusieurs tables fermées au client et détache
 * des signalements. Aucun de ces gestes n'est ouvert au rôle `authenticated`,
 * et il ne faut surtout pas les lui ouvrir pour l'occasion.
 *
 * Le cloisonnement tient au filtre : tout part de `auth.uid()`, la fonction ne
 * prend **aucun** identifiant en paramètre. Il n'existe donc pas de version de
 * cet appel qui supprimerait le compte de quelqu'un d'autre.
 *
 * Renvoie un décompte de ce qui a été retiré, pour que l'interface puisse le
 * montrer plutôt que d'affirmer vaguement que « tout a été supprimé ».
 */
create or replace function public.delete_my_account()
returns table (
  ads_archived    integer,
  images_removed  integer,
  favorites_removed integer,
  notifications_removed integer,
  reports_detached integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_role public.user_role;
  v_status public.account_status;
begin
  if v_user is null then
    raise exception 'Aucune session.' using errcode = 'P0001';
  end if;

  select u.role, u.status into v_role, v_status
    from public.users u where u.id = v_user;

  if v_status = 'deleted' then
    raise exception 'Ce compte est déjà supprimé.' using errcode = 'P0001';
  end if;

  /*
   * Un administrateur ne se supprime pas lui-même. Ce n'est pas une question de
   * droits — il en a plus que quiconque — mais de continuité : rien
   * n'empêcherait le dernier administrateur de laisser la plateforme sans
   * personne pour la modérer, et il n'existerait alors plus aucun chemin dans
   * l'application pour en nommer un autre.
   */
  if v_role = 'admin' then
    raise exception
      'Un compte administrateur ne peut pas être supprimé depuis l''application. Transférez d''abord le rôle.'
      using errcode = 'P0001';
  end if;

  -- --- Annonces -------------------------------------------------------------
  /*
   * Archivées, pas supprimées. `conversations.ad_id` est en `on delete
   * cascade` : effacer les annonces effacerait les discussions que des
   * acheteurs ont eues à leur sujet. L'archivage les retire de la vitrine, ce
   * qui est le résultat attendu, sans emporter l'historique d'autrui.
   *
   * Les coordonnées inscrites sur l'annonce, elles, partent : ce sont des
   * données personnelles, et elles n'ont plus lieu d'être jointes.
   */
  update public.ads
     set status = 'archived',
         contact_phone = null,
         contact_whatsapp = null,
         latitude = null,
         longitude = null
   where seller_id = v_user
     and status <> 'archived';
  get diagnostics ads_archived = row_count;

  -- Photos : le contenu le plus personnel d'une annonce (un domicile, un
  -- visage, une plaque). Rien ne justifie de les conserver.
  delete from storage.objects
   where bucket_id = 'ad-images'
     and (storage.foldername(name))[1] = v_user::text;

  delete from public.ad_images i
   using public.ads a
   where i.ad_id = a.id and a.seller_id = v_user;
  get diagnostics images_removed = row_count;

  -- --- Traces personnelles --------------------------------------------------
  delete from public.favorites where user_id = v_user;
  get diagnostics favorites_removed = row_count;

  delete from public.notifications where user_id = v_user;
  get diagnostics notifications_removed = row_count;

  delete from public.search_history where user_id = v_user;
  delete from public.ad_views where user_id = v_user;
  delete from public.notification_settings where user_id = v_user;
  delete from public.email_outbox where user_id = v_user;

  -- Les blocages posés **par** ce compte n'ont plus d'objet. Ceux posés
  -- **contre** lui restent : ils protègent quelqu'un d'autre, et ce n'est pas
  -- à la personne bloquée de les lever en s'en allant.
  delete from public.blocked_users where blocker_id = v_user;

  /*
   * Demandes de vérification : elles contiennent des pièces d'identité. C'est
   * la donnée la plus sensible de toute la plateforme, et elle part la
   * première — fichiers compris.
   */
  delete from storage.objects
   where bucket_id in ('verification-docs', 'avatars')
     and (storage.foldername(name))[1] = v_user::text;

  delete from public.verification_requests where user_id = v_user;

  -- --- Signalements ---------------------------------------------------------
  /*
   * Détachés, pas supprimés : un dossier de modération en cours ne doit pas
   * s'évaporer parce que le signaleur ferme son compte — ce serait offrir un
   * moyen commode d'effacer une accusation gênante. Il perd simplement son
   * auteur.
   */
  update public.reports set reporter_id = null where reporter_id = v_user;
  get diagnostics reports_detached = row_count;

  -- --- Abonnements ----------------------------------------------------------
  -- Résiliés en fin de période, jamais effacés : ils sont adossés à des
  -- règlements que la comptabilité doit pouvoir retrouver.
  update public.subscriptions
     set auto_renew = false, cancel_at_period_end = true
   where user_id = v_user
     and status in ('trialing', 'active');

  -- --- Le profil lui-même ---------------------------------------------------
  /*
   * `full_name` porte une contrainte de longueur (2 à 80) : impossible de le
   * vider, on y met donc une mention explicite. C'est aussi ce que verront les
   * personnes qui ont conversé avec ce compte, et c'est plus honnête qu'un nom
   * effacé qui laisserait croire à un bogue.
   */
  update public.users
     set full_name       = 'Compte supprimé',
         username        = null,
         phone           = null,
         whatsapp        = null,
         city            = null,
         province        = null,
         district        = null,
         avatar_path     = null,
         bio             = null,
         business_name   = null,
         is_professional = false,
         is_verified     = false,
         status          = 'deleted'
   where id = v_user;

  return next;
end;
$$;

comment on function public.delete_my_account() is
  'Anonymise définitivement le compte courant. Irréversible. Conserve messages, avis et paiements, détachés de toute identité.';

/*
 * Exécutable par un compte authentifié, et par lui seul. `anon` n'a rien à y
 * faire : sans session la fonction lève de toute façon, mais un droit non
 * accordé vaut mieux qu'un droit rattrapé à l'exécution.
 */
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- =============================================================================
-- 3. UN COMPTE SUPPRIMÉ N'AGIT PLUS
-- =============================================================================
--  `is_active_account()` conditionne déjà les écritures et n'accepte que le
--  statut « active » : un compte passé à « deleted » ne peut donc plus rien
--  publier, envoyer ni évaluer. Le vérifier ici serait redondant — mais la
--  suite de tests, elle, l'affirme explicitement : c'est la garantie qui reste
--  si la révocation côté authentification échouait.
-- =============================================================================
