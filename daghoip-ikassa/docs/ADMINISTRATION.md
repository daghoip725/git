# Guide d'administration

Faire tourner Daghoip Ikassa au quotidien : modérer, encaisser, surveiller.

Ce guide s'adresse à qui exploite la plateforme, pas à qui la développe. Il
suppose un compte `admin` — voir
[l'installation](INSTALLATION.md#créer-le-premier-administrateur) si vous n'en
avez pas encore.

---

## Sommaire

1. [Les rôles](#les-rôles)
2. [Le tableau de bord](#le-tableau-de-bord)
3. [Modérer](#modérer)
4. [Encaisser](#encaisser)
5. [Vérifier un vendeur](#vérifier-un-vendeur)
6. [Tâches planifiées](#tâches-planifiées)
7. [Ce qui est tracé](#ce-qui-est-tracé)
8. [Ce que vous ne pouvez pas faire, et pourquoi](#ce-que-vous-ne-pouvez-pas-faire-et-pourquoi)
9. [Incidents courants](#incidents-courants)

---

## Les rôles

Trois, et ils sont hiérarchiques.

| Rôle        | Peut                                                                                                               | Ne peut pas                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `user`      | Publier, échanger, signaler                                                                                        | Rien de l'espace `/admin`                                       |
| `moderator` | Tout ce qui précède, plus : file de triage, modération d'annonces, suspension de comptes ordinaires, vérifications | Toucher au rôle de quiconque, sanctionner un membre de l'équipe |
| `admin`     | Tout                                                                                                               | Se supprimer soi-même depuis l'application                      |

**Le rôle ne se change pas depuis l'interface.** La colonne `role` est exclue du
`GRANT UPDATE` : aucune requête, même forgée, ne peut promouvoir un compte. La
promotion passe par `admin_set_user_role()`, réservée aux administrateurs, ou
par le SQL Editor pour le tout premier.

```sql
update public.users set role = 'moderator' where id = '<uuid>';
```

> Un modérateur ne peut pas sanctionner un administrateur. Ce n'est pas une
> question de confiance : c'est ce qui empêche un compte de modération
> compromis de décapiter la plateforme.

---

## Le tableau de bord

`/admin`, douze écrans.

| Écran                  | À quoi il sert                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| `/admin`               | Vue d'ensemble : indicateurs du jour, ce qui attend une décision |
| `/admin/statistiques`  | Séries quotidiennes et répartitions                              |
| `/admin/utilisateurs`  | Recherche de comptes, rôles, statuts                             |
| `/admin/annonces`      | Modération des annonces                                          |
| `/admin/categories`    | Arborescence des catégories                                      |
| `/admin/signalements`  | File de triage                                                   |
| `/admin/fraude`        | Annonces portant des signaux automatiques                        |
| `/admin/verifications` | Demandes de badge vendeur vérifié                                |
| `/admin/paiements`     | Règlements, confirmation manuelle                                |
| `/admin/abonnements`   | Abonnements en cours et échéances                                |
| `/admin/journal`       | Journal d'audit                                                  |
| `/admin/parametres`    | Réglages de la plateforme                                        |

Les chiffres sont des **agrégats**. Aucun écran d'administration n'affiche le
contenu des messages privés : la modération d'un échange se fait sur
signalement, à partir du message signalé, et pas en parcourant les
conversations.

---

## Modérer

### La file de triage

`/admin/signalements` regroupe **par cible** et ordonne par **signaleurs
distincts**.

> Huit personnes sans lien entre elles qui désignent le même compte, c'est un
> dossier. Huit signalements d'une même personne, c'est de l'acharnement.

Une liste chronologique confondait les deux. Trois chiffres suffisent à décider
par où commencer : signaleurs distincts, ancienneté du plus vieux dossier,
motifs invoqués.

### Avant de trancher

Ouvrez le **dossier du compte**. Il donne l'ancienneté, les annonces publiées,
les signalements reçus — et les signalements **émis**. Ce dernier chiffre
compte : un signaleur compulsif dont les dossiers sont systématiquement rejetés
est un signal en soi.

### Bloquer

Le blocage enchaîne le changement de statut et la clôture des signalements
visant ce compte. Les deux vont toujours ensemble en pratique ; les laisser
séparés revenait à compter sur la discipline du modérateur pour que la file
reste juste.

Ses annonces publiées sortent de la vitrine, et l'action est inscrite au journal
d'audit.

| Statut      | Effet                                                               |
| ----------- | ------------------------------------------------------------------- |
| `suspended` | Ne peut plus rien écrire. Réversible.                               |
| `banned`    | Idem, mais définitif dans l'usage courant.                          |
| `deleted`   | Compte anonymisé — posé par la personne elle-même, jamais par vous. |

> Un compte suspendu ou banni ne reçoit **plus** de notification :
> `create_notification()` exige un compte actif. L'interface le dit au
> modérateur plutôt que de laisser croire que la personne a été prévenue.

### Aucune sanction automatique

**Aucun compte n'est bloqué par un compteur de signalements.** Un mécanisme qui
bannirait au bout de N signalements offrirait à n'importe quel groupe coordonné
le moyen de faire taire un concurrent. Un signalement ouvre un dossier, une
personne tranche — et la suite de tests le vérifie explicitement.

Il en va de même pour `/admin/fraude` : les signaux sont **indicatifs**. Un prix
anormalement bas, un compte tout neuf publiant dix annonces, un texte recopié
d'une autre annonce — chacun a des explications innocentes. L'écran les classe,
il ne décide pas.

---

## Encaisser

### Ce qui se passe tout seul

Quand un opérateur Mobile Money est configuré, le règlement s'applique au retour
du rappel signé. L'abonnement ou la mise en avant est activé dans la même
transaction que la confirmation du paiement : il n'existe pas d'état
intermédiaire où l'un est acquis sans l'autre.

Un rappel rejoué **n'a aucun effet** : l'application est idempotente. Et le
montant annoncé par le rappel n'est jamais cru — l'application relit le sien.

### Ce qui demande votre main

Sans contrat opérateur, ou pour un virement et des espèces :

1. la personne choisit « virement » ou « espèces » ;
2. un règlement est ouvert, en attente ;
3. vous vérifiez la réception sur votre compte ;
4. `/admin/paiements` → **Confirmer**, avec une note.

La confirmation manuelle est réservée aux **administrateurs**, pas aux
modérateurs : c'est un geste comptable. Et le payeur ne peut évidemment pas se
déclarer payé lui-même — c'est vérifié par la suite de tests.

### Factures

Numérotées par année, en série continue et sans trou. La numérotation est
attribuée à la confirmation du règlement, jamais à son ouverture : un paiement
abandonné ne consomme pas de numéro.

---

## Vérifier un vendeur

`/admin/verifications`. Le demandeur a déposé une pièce d'identité et, s'il est
professionnel, un numéro RCCM ou NIF.

Ces pièces sont **la donnée la plus sensible de la plateforme**. Elles vivent
dans un compartiment de stockage privé, et sont supprimées — fichiers compris —
dès que le compte est supprimé.

Le badge peut être retiré par la suite (`admin_revoke_verification`), avec un
motif. Retrait et attribution sont tracés au journal d'audit.

---

## Tâches planifiées

Dix tâches `pg_cron`, toutes en base. **Sans l'extension activée, rien de ceci
ne tourne** : les migrations affichent alors un avertissement et poursuivent.

| Tâche                            | Quand                   | Ce qui se passe sans elle                               |
| -------------------------------- | ----------------------- | ------------------------------------------------------- |
| `daghoip-expire-ads`             | 3 h 00, chaque jour     | Les annonces restent en ligne indéfiniment              |
| `daghoip-notify-expiring-ads`    | 8 h 00                  | Personne n'est prévenu avant l'expiration               |
| `daghoip-expire-featured`        | toutes les heures       | Les mises en avant payées ne s'arrêtent jamais          |
| `daghoip-expire-subscriptions`   | 2 h 00                  | Les abonnements échus restent actifs                    |
| `notifier-abonnements-expirants` | 8 h 00                  | Aucun rappel d'échéance                                 |
| `daghoip-purge-notifications`    | dimanche, 4 h 00        | La table de notifications grossit sans fin              |
| `purger-file-emails`             | 3 h 30                  | La file d'envoi conserve des adresses inutilement       |
| `purger-historiques`             | 4 h 15                  | Les historiques personnels ne sont jamais purgés (90 j) |
| `purger-statistiques-annonces`   | 4 h 45                  | Les empreintes de contact survivent au-delà de 7 jours  |
| `daghoip-refresh-stats`          | tous les quarts d'heure | Le tableau de bord affiche des chiffres figés           |

Vérifier qu'elles tournent :

```sql
select jobname, schedule, active from cron.job order by jobname;
select jobname, status, start_time
  from cron.job_run_details
 order by start_time desc limit 20;
```

**L'envoi des courriels n'est pas une tâche `pg_cron`** : il passe par
`POST /api/notifications/envoi`, à appeler toutes les cinq minutes depuis
l'extérieur (voir [la documentation d'API](API.md#post-apinotificationsenvoi)).
La base ne peut pas émettre de requête HTTP sortante.

---

## Ce qui est tracé

`/admin/journal` — le journal d'audit. Y figurent les changements de rôle et de
statut, les décisions de vérification, la modération d'annonces et la
résolution de signalements.

Il est écrit par les fonctions elles-mêmes, pas par l'interface : une action
menée depuis le SQL Editor y figure aussi.

Ce qui **n'y est pas**, délibérément : les consultations. Savoir qui a regardé
quel profil n'aide pas à modérer et constituerait un fichier de surveillance
interne.

---

## Ce que vous ne pouvez pas faire, et pourquoi

**Lire le téléphone de quelqu'un depuis un écran d'administration.** Les
colonnes de contact sont hors du `GRANT SELECT` public. Elles apparaissent sur
une annonce, quand son auteur a choisi de les publier.

**Voir qui a contacté une annonce.** La table des contacts ne porte **aucune
identité** — ni compte, ni session, ni adresse IP, seulement une empreinte
purgée au bout de sept jours. Le vendeur apprend _combien_ de personnes l'ont
contacté et _par quel canal_, jamais _qui_. Personne, vous compris, ne peut
remonter au visiteur.

**Supprimer un compte à la place de son titulaire.** `delete_my_account()` ne
prend **aucun paramètre** : elle n'agit que sur l'appelant. Pour retirer
quelqu'un de la plateforme, l'outil est le blocage.

**Supprimer votre propre compte administrateur depuis l'application.** Le
dernier d'entre vous laisserait la plateforme sans modération, et aucun écran
ne permettrait plus d'en nommer un autre. Transférez d'abord le rôle.

**Restaurer un compte supprimé.** L'anonymisation est irréversible : les données
personnelles ne sont pas masquées, elles sont écrasées.

---

## Incidents courants

**Un vendeur dit ne pas recevoir ses courriels**
Vérifiez d'abord `RESEND_API_KEY` et le domaine expéditeur chez le fournisseur —
un domaine non vérifié envoie en indésirables, ou n'envoie pas. Puis la file :

```sql
select kind, attempts, last_error, created_at
  from public.email_outbox
 where sent_at is null
 order by created_at limit 20;
```

Si `attempts` monte sans `sent_at`, c'est le fournisseur ; si rien n'est
réclamé, c'est la tâche externe qui n'appelle pas la route.

**Un règlement reste « en attente » alors que l'opérateur dit avoir encaissé**
Le rappel n'est pas arrivé, ou sa signature a été rejetée :

```sql
select provider, event_type, signature_valid, applied, received_at
  from public.payment_events
 order by received_at desc limit 20;
```

`signature_valid = false` : le secret partagé ne correspond pas à celui déclaré
chez l'opérateur. Aucune ligne du tout : l'URL de rappel n'est pas déclarée, ou
n'est pas joignable. En attendant, confirmez à la main.

**Le tableau de bord affiche des chiffres figés**
La vue matérialisée n'est plus rafraîchie. Vérifiez `daghoip-refresh-stats`, et
au besoin : `refresh materialized view concurrently public.platform_stats;`

**Les annonces n'expirent plus**
`pg_cron` n'est pas activé, ou les migrations qui planifient n'ont pas été
rejouées après activation. Vérifiez `select * from cron.job;`.

**Un compte banni continue de publier**
Impossible en théorie : `is_active_account()` conditionne toutes les écritures.
Vérifiez que le statut a bien été enregistré (`select status from public.users
where id = …`) — s'il est `active`, la sanction n'a pas été appliquée.

**« Un compte administrateur ne peut pas être supprimé depuis l'application »**
C'est le garde-fou, pas un défaut. Transférez le rôle à un autre compte, puis
recommencez.
