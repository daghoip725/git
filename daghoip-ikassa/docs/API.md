# Documentation de l'API

Ce que la plateforme expose, à qui, et sous quelles garanties.

Il n'y a pas d'API REST maison : l'application parle à PostgreSQL par
**PostgREST**, la couche que Supabase place devant la base. Les fonctions SQL
listées ici sont donc appelables directement, y compris depuis un navigateur —
et c'est pour cette raison qu'aucune n'accorde quoi que ce soit sans vérifier
elle-même qui appelle.

Pour installer : [`INSTALLATION.md`](INSTALLATION.md).
Pour comprendre l'organisation du code : [`DEVELOPPEMENT.md`](DEVELOPPEMENT.md).

---

## Sommaire

1. [Le modèle d'autorisation](#le-modèle-dautorisation)
2. [Appeler une fonction](#appeler-une-fonction)
3. [Fonctions SQL (RPC)](#fonctions-sql-rpc)
4. [Routes REST](#routes-rest)
5. [Server Actions](#server-actions)
6. [Erreurs](#erreurs)
7. [Limitation de débit](#limitation-de-débit)
8. [Ce que cette page garantit](#ce-que-cette-page-garantit)

---

## Le modèle d'autorisation

Trois rôles PostgreSQL, et un seul jeton côté navigateur.

| Rôle            | Qui                        | Comment il est obtenu                         |
| --------------- | -------------------------- | --------------------------------------------- |
| `anon`          | Visiteur non connecté      | Clé anonyme, publique par conception          |
| `authenticated` | Compte connecté            | Même clé, plus un jeton de session            |
| `service_role`  | Nos propres tâches serveur | Clé secrète, **jamais** envoyée au navigateur |

La clé anonyme est publique et c'est normal : elle n'autorise rien par
elle-même. Ce sont les politiques d'accès (RLS) et les privilèges de colonne
qui décident, requête par requête, ligne par ligne, colonne par colonne. Une
requête forgée depuis la console du navigateur n'obtient pas davantage que
l'application.

Trois conséquences pratiques pour qui appelle ces fonctions :

- **`auth.uid()` fait foi.** Aucune fonction n'accepte un identifiant
  d'utilisateur en paramètre pour agir « au nom de ». Là où c'était tentant —
  la suppression de compte — la fonction ne prend **aucun** argument, et un
  test le vérifie.
- **Un refus ressemble à une absence.** Consulter les performances d'une
  annonce qui n'est pas la vôtre renvoie la même erreur que pour une annonce
  inexistante : répondre « elle existe, mais elle n'est pas à vous » apprendrait
  déjà quelque chose.
- **Certaines colonnes sont invisibles**, même à leur propriétaire, en lecture
  directe : `users.phone`, `users.whatsapp`, `users.district`, `users.language`
  passent par `get_my_profile()`.

---

## Appeler une fonction

```ts
const { data, error } = await supabase.rpc('search_ads', {
  p_query: 'toyota',
  p_city: 'Libreville',
  p_limit: 24,
});
```

Tous les paramètres portent le préfixe `p_` et sont **facultatifs sauf mention
contraire** : les fonctions bornent elles-mêmes ce qui doit l'être. Une fenêtre
de statistiques demandée à 9 999 jours revient à 180 ; une pagination à 10 000
résultats revient au plafond. Ce n'est pas de la tolérance, c'est ce qui évite
qu'un appel maladroit devienne un déni de service.

Le typage TypeScript de chaque signature est dans
[`types/database.ts`](../types/database.ts), et un test d'intégration compare
ce fichier au schéma réel à chaque exécution de `npm run test:sql`.

---

## Fonctions SQL (RPC)

Les **59 fonctions appelées par l'application**. La base en contient davantage
— déclencheurs, aides internes, maintenance planifiée — qui ne sont pas
destinées à être appelées et ne figurent pas ici.

> Cette liste est **vérifiée** : `tests/integration/api-doc.test.mts` échoue si
> une fonction appelée par le code n'y figure pas, ou si une fonction
> documentée n'existe pas en base. Une documentation d'API qui dérive est pire
> qu'une absence de documentation, parce qu'on lui fait confiance.

### Annonces et recherche

| Fonction             | Arguments                                                                                                                                                                                                                                                                                                                                                                                  | Description                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `search_ads`         | `p_query text, p_category_slug text, p_city text, p_province text, p_district text, p_min_price bigint, p_max_price bigint, p_condition ad_condition, p_price_type price_type, p_seller_id uuid, p_featured_only boolean, p_max_age_days integer, p_latitude double precision, p_longitude double precision, p_radius_km double precision, p_sort text, p_limit integer, p_offset integer` | Recherche paginée : texte, catégorie, ville, quartier, prix, état, ancienneté, rayon. Renvoie aussi le total, en une seule requête. |
| `suggest_ads`        | `p_query text, p_limit integer`                                                                                                                                                                                                                                                                                                                                                            | Suggestions de saisie, pour la barre de recherche.                                                                                  |
| `recommend_ads`      | `p_limit integer`                                                                                                                                                                                                                                                                                                                                                                          | Annonces recommandées au compte courant, d’après ses consultations et ses favoris.                                                  |
| `increment_ad_views` | `p_ad_id uuid`                                                                                                                                                                                                                                                                                                                                                                             | Compte une vue. Sans effet sur une annonce retirée.                                                                                 |
| `toggle_favorite`    | `p_ad_id uuid`                                                                                                                                                                                                                                                                                                                                                                             | Ajoute ou retire des favoris, en une opération atomique — un double clic ne crée pas de doublon.                                    |
| `list_districts`     | `p_city text, p_limit integer`                                                                                                                                                                                                                                                                                                                                                             | Quartiers connus d’une ville, pour l’autocomplétion.                                                                                |
| `ad_quota`           | `p_user_id uuid`                                                                                                                                                                                                                                                                                                                                                                           | Nombre d’annonces actives encore permises, d’après l’offre en cours.                                                                |
| `find_duplicate_ads` | `p_ad_id uuid, p_threshold real, p_limit integer`                                                                                                                                                                                                                                                                                                                                          | Annonces proches, par similarité trigramme du titre et de la description.                                                           |
| `suggest_price`      | `p_category_id uuid, p_city text, p_condition ad_condition`                                                                                                                                                                                                                                                                                                                                | Fourchette de prix observée pour une catégorie, une ville et un état donnés.                                                        |

### Performances des annonces

| Fonction             | Arguments                                                 | Description                                                                                                                                  |
| -------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `record_ad_contact`  | `p_ad_id uuid, p_channel contact_channel, p_visitor text` | Compte un contact, une fois par visiteur et par jour. Aucune identité conservée. Renvoie `false` sans erreur quand le contact ne compte pas. |
| `ad_performance`     | `p_ad_id uuid`                                            | Indicateurs d’une annonce : vues, contacts, favoris, messages, taux de contact, médiane de la catégorie. Réservée au propriétaire.           |
| `ad_daily_series`    | `p_ad_id uuid, p_days integer`                            | Série quotidienne d’une annonce, sans trou : un jour creux vaut zéro. Fenêtre bornée à 7–180 jours.                                          |
| `seller_performance` | `p_days integer`                                          | Synthèse du compte courant, toutes annonces confondues.                                                                                      |
| `seller_ad_ranking`  | `p_limit integer`                                         | Classement des annonces du compte, trié par **contacts** et non par vues.                                                                    |

### Messagerie

| Fonction                     | Arguments                                                     | Description                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_or_create_conversation` | `p_ad_id uuid`                                                | Ouvre le fil avec le vendeur d’une annonce, ou retrouve celui qui existe déjà.                                                                |
| `send_message`               | `p_conversation_id uuid, p_body text, p_attachment_path text` | Poste un message. Le déclencheur d’insertion refuse un envoi vers un compte bloqué ou une pièce jointe qui n’appartient pas à son expéditeur. |
| `mark_conversation_read`     | `p_conversation_id uuid`                                      | Marque le fil comme lu pour le compte courant.                                                                                                |
| `search_conversations`       | `p_query text, p_limit integer`                               | Recherche dans les fils : contenu des messages **et** titre de l’annonce.                                                                     |
| `block_user`                 | `p_user_id uuid, p_reason text`                               | Bloque un compte. Unilatéral : chacun ne voit que ses propres blocages.                                                                       |
| `unblock_user`               | `p_user_id uuid`                                              | Lève un blocage posé par le compte courant.                                                                                                   |
| `list_blocked_users`         | —                                                             | Comptes bloqués par le compte courant.                                                                                                        |
| `is_blocked_between`         | `p_a uuid, p_b uuid`                                          | Un blocage existe-t-il, dans un sens ou dans l’autre ?                                                                                        |

### Compte et profil

| Fonction               | Arguments                                                                                                                                               | Description                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `get_my_profile`       | —                                                                                                                                                       | Profil complet du compte courant, coordonnées et langue comprises. Seul chemin de lecture pour les colonnes non publiques. |
| `current_user_role`    | —                                                                                                                                                       | Rôle du compte courant.                                                                                                    |
| `is_staff`             | —                                                                                                                                                       | Le compte courant est-il modérateur ou administrateur ?                                                                    |
| `can_review`           | `p_reviewer uuid, p_reviewee uuid, p_ad_id uuid`                                                                                                        | Le compte courant peut-il évaluer ce vendeur ? Exige un échange réel entre les deux parties.                               |
| `delete_my_account`    | —                                                                                                                                                       | Anonymise définitivement le compte courant. Irréversible. **Aucun paramètre**, par conception.                             |
| `request_verification` | `p_full_legal_name text, p_contact_phone text, p_id_document_path text, p_business_name text, p_business_id_number text, p_business_document_path text` | Dépose une demande de badge vendeur vérifié, pièces à l’appui.                                                             |

### Historiques personnels

| Fonction               | Arguments                                          | Description                                                                    |
| ---------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `record_search`        | `p_query text, p_filters jsonb, p_results integer` | Enregistre une recherche dans l’historique du compte. Normalise et plafonne.   |
| `recent_searches`      | `p_limit integer`                                  | Recherches récentes du compte.                                                 |
| `clear_search_history` | —                                                  | Efface tout l’historique de recherche. Renvoie le nombre d’entrées supprimées. |
| `record_ad_view`       | `p_ad_id uuid`                                     | Enregistre la consultation d’une annonce dans l’historique du compte.          |
| `recent_ad_views`      | `p_limit integer`                                  | Annonces consultées récemment, prêtes à l’affichage.                           |
| `clear_ad_views`       | —                                                  | Efface tout l’historique de consultation.                                      |

### Notifications

| Fonction                     | Arguments                 | Description                                                       |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------- |
| `unread_notifications_count` | —                         | Nombre de notifications non lues.                                 |
| `mark_notifications_read`    | `p_ids uuid[]`            | Marque comme lues, toutes ou une seule.                           |
| `claim_pending_emails`       | `p_limit integer`         | Réserve un lot de courriels à envoyer. `service_role` uniquement. |
| `mark_email_sent`            | `p_id uuid, p_error text` | Clôt un envoi, ou consigne son échec. `service_role` uniquement.  |

### Paiements

| Fonction                 | Arguments                                                                                                                                                              | Description                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `request_subscription`   | `p_plan_code text, p_provider payment_provider, p_payer_phone text`                                                                                                    | Ouvre un règlement d’abonnement. Le tarif est relu en base, jamais reçu du client. |
| `request_ad_feature`     | `p_ad_id uuid, p_plan_code text, p_provider payment_provider, p_payer_phone text`                                                                                      | Ouvre un règlement de mise en avant. Vérifie que l’annonce appartient au payeur.   |
| `cancel_payment`         | `p_payment_id uuid`                                                                                                                                                    | Annule un règlement encore en attente.                                             |
| `get_invoice`            | `p_payment_id uuid`                                                                                                                                                    | Facture d’un règlement abouti.                                                     |
| `apply_payment_callback` | `p_reference text, p_provider payment_provider, p_provider_reference text, p_status payment_status, p_payload jsonb, p_failure_reason text, p_signature_valid boolean` | Applique un rappel d’opérateur, une fois et une seule. `service_role` uniquement.  |

### Signalement et modération

| Fonction                     | Arguments                                                                                 | Description                                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `report_user`                | `p_user_id uuid, p_reason report_reason, p_details text`                                  | Signale un compte. Un second signalement par la même personne n’en crée pas un autre.      |
| `moderation_queue`           | `p_limit integer`                                                                         | File de triage, groupée **par cible** et ordonnée par signaleurs distincts.                |
| `account_dossier`            | `p_user_id uuid`                                                                          | Dossier d’un compte avant décision : ancienneté, annonces, signalements reçus **et émis**. |
| `block_account`              | `p_user_id uuid, p_status account_status, p_reason text`                                  | Change le statut d’un compte et clôt les signalements le visant, d’un seul geste.          |
| `resolve_reports_for_target` | `p_target_type report_target_type, p_target_id uuid, p_status report_status, p_note text` | Clôt tous les signalements visant une cible.                                               |
| `flagged_ads`                | `p_min_score integer, p_limit integer`                                                    | Annonces portant des signaux de fraude, du plus au moins probable.                         |
| `ad_fraud_signals`           | `p_ad_id uuid`                                                                            | Signaux détectés sur une annonce, avec leur poids.                                         |

### Administration

| Fonction                    | Arguments                                                | Description                                                                      |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `admin_kpis`                | —                                                        | Indicateurs instantanés du tableau de bord. Agrégats seuls.                      |
| `admin_daily_stats`         | `p_days integer`                                         | Séries quotidiennes : comptes, annonces, messages, recettes.                     |
| `admin_ad_distribution`     | `p_dimension text, p_limit integer`                      | Répartition des annonces selon une dimension (catégorie, ville, état…).          |
| `admin_set_user_role`       | `p_user_id uuid, p_role user_role`                       | Change le rôle d’un compte. Administrateur uniquement, tracé au journal d’audit. |
| `admin_set_user_status`     | `p_user_id uuid, p_status account_status, p_reason text` | Suspend, bannit ou réactive un compte. Tracé au journal d’audit.                 |
| `admin_moderate_ad`         | `p_ad_id uuid, p_action text, p_reason text`             | Approuve, rejette ou retire une annonce.                                         |
| `admin_confirm_payment`     | `p_payment_id uuid, p_note text`                         | Confirme à la main un règlement hors ligne (virement, espèces).                  |
| `review_verification`       | `p_request_id uuid, p_approve boolean, p_reason text`    | Accepte ou refuse une demande de vérification vendeur.                           |
| `admin_revoke_verification` | `p_user_id uuid, p_reason text`                          | Retire un badge vendeur vérifié.                                                 |

---

## Routes REST

Deux seulement. Tout le reste passe par les fonctions ci-dessus ou par des
Server Actions.

### `POST /api/paiements/[provider]/callback`

Rappel d'un opérateur Mobile Money. `provider` vaut `airtel_money` ou
`moov_money`.

**Authentification** : signature HMAC-SHA256 du corps brut, avec le secret
partagé de l'opérateur. Une signature invalide est **enregistrée puis
rejetée** — la trace compte autant que le refus, c'est ce qui permet de
distinguer une erreur de configuration d'une tentative.

| Comportement                      | Réponse                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| Signature valide, paiement trouvé | Le règlement est appliqué, une fois et une seule.                          |
| Rappel rejoué                     | Sans effet : l'application est idempotente.                                |
| Référence inconnue                | Journalisée, sans erreur — l'opérateur ne doit pas réessayer indéfiniment. |
| Signature invalide                | Rejetée, et consignée.                                                     |

L'application ne fait jamais confiance au montant annoncé par le rappel : elle
relit le sien en base.

### `POST /api/notifications/envoi`

Draine la file d'envoi des courriels. Destinée à une tâche planifiée, toutes
les cinq minutes.

**Authentification** : `Authorization: Bearer $NOTIFICATIONS_CRON_SECRET`.
Sans ce secret, la route serait déclenchable en boucle par n'importe qui.

```bash
curl -X POST https://votre-domaine.ga/api/notifications/envoi \
     -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET"
```

---

## Server Actions

Soixante-quatre fonctions dans `app/actions/`, appelées **depuis les formulaires
de l'application** et non depuis l'extérieur : Next.js protège leur point
d'entrée par un identifiant généré au build. Elles ne constituent pas une API
publique et ne sont pas listées une à une ici.

Toutes suivent la même forme :

```ts
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };
```

Elles **revalident systématiquement** leurs entrées avec Zod, même quand le
formulaire l'a déjà fait : le formulaire relève de l'ergonomie, pas de la
sécurité. Et elles ne lèvent pas — une erreur revient dans `error`, pour être
affichée.

Le détail de leur écriture est dans
[`DEVELOPPEMENT.md`](DEVELOPPEMENT.md#forme-dune-server-action).

---

## Erreurs

| Origine                | Forme                                                                          |
| ---------------------- | ------------------------------------------------------------------------------ |
| Règle métier (`P0001`) | Message français, écrit pour être lu, affichable tel quel.                     |
| Politique d'accès      | Ligne absente ou `permission denied` — jamais d'explication sur ce qui existe. |
| Contrainte de la base  | Code PostgreSQL standard (`23505` doublon, `23514` contrainte).                |

Les messages `P0001` sont rédigés à l'intention de l'utilisateur final et ne
décrivent jamais la structure de la base. Les autres sont journalisés côté
serveur et remplacés par un texte générique côté interface : une erreur de
contrainte ne doit pas apprendre le schéma à qui la provoque.

---

## Limitation de débit

Appliquée dans les Server Actions, par compte ou par adresse selon ce qu'on
protège. Les valeurs sont dans [`lib/rate-limit.ts`](../lib/rate-limit.ts).

| Action                 | Limite                           | Ce qu'on protège                            |
| ---------------------- | -------------------------------- | ------------------------------------------- |
| Authentification       | 10 / 15 min / adresse            | Le devinage de mot de passe                 |
| Envoi de SMS           | 5 / 15 min / adresse, 3 / numéro | Le budget, et le harcèlement d'un numéro    |
| Publication d'annonce  | 10 / heure                       | Le déversement automatisé                   |
| Message                | 30 / heure                       | Le harcèlement                              |
| Signalement            | 10 / jour                        | L'acharnement                               |
| Ouverture de paiement  | 10 / heure                       | Chaque demande sonne le téléphone du payeur |
| Assistant de rédaction | voir `RATE_LIMITS`               | Le coût réel en jetons                      |

> ⚠️ Le compteur est **en mémoire du processus**. Derrière plusieurs répliques,
> chacune tient le sien : la limite effective est multipliée par le nombre
> d'instances. Pour un déploiement réparti, remplacez l'implémentation par un
> magasin partagé en conservant la signature de `checkRateLimit` — aucun
> appelant n'a besoin d'être modifié.

---

## Ce que cette page garantit

Les **noms de fonctions et leurs arguments** sont extraits du schéma réel et
vérifiés par un test à chaque exécution de `npm run test:sql`. Ils ne peuvent
pas dériver sans que la suite échoue.

Les **descriptions**, les tableaux de comportement et les explications sont
écrits à la main : ils peuvent vieillir. En cas de doute, la source fait foi —
`supabase/migrations/` pour les fonctions, `app/api/` pour les routes.
