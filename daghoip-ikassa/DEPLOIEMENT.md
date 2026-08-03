# Déploiement de Daghoip Ikassa

Trois chemins, du plus simple au plus manuel. Tous partent du même dépôt Git et
de la même image Docker : ce qui tourne en production est exactement ce que la
CI a construit.

1. [Avant de commencer](#avant-de-commencer)
2. [Déploiement automatique (GitHub Actions)](#déploiement-automatique-github-actions)
3. [Coolify](#coolify)
4. [Hostinger (VPS)](#hostinger-vps)
5. [Docker seul](#docker-seul)
6. [Après le déploiement](#après-le-déploiement)
7. [Mise à jour](#mise-à-jour)
8. [En cas de problème](#en-cas-de-problème)

---

## Avant de commencer

### 1. Le projet Supabase

L'application ne fonctionne pas sans base. Créez le projet, puis rejouez dans
l'ordre les dix-sept migrations de `supabase/migrations/`, suivies de
`supabase/seed.sql` (voir [`supabase/README.md`](supabase/README.md)).

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Créez ensuite le premier administrateur : aucun ne peut être créé depuis
l'application, `role` étant hors du `GRANT UPDATE`.

```sql
update public.users set role = 'admin' where id = '<uuid>';
```

### 2. Les variables d'environnement

Deux familles, à ne pas confondre — c'est la source d'erreur la plus fréquente.

| Famille         | Quand elle est lue | Conséquence                                                                                                       |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_*` | **au build**       | Inlinée dans le bundle envoyé au navigateur. La changer après coup n'a aucun effet tant qu'on ne reconstruit pas. |
| Les autres      | au démarrage       | Modifiables sans reconstruire ; jamais exposées au navigateur.                                                    |

Les variables obligatoires sont `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` et `NEXT_PUBLIC_SITE_URL`. La liste complète est
dans [`.env.example`](.env.example).

**Vérifiez-les avant de déployer**, plutôt que de découvrir le problème en
production :

```bash
npm run verify:env -- --prod
```

`lib/env.ts` valide déjà la _forme_ des variables au démarrage. Ce script pose
une autre question : la configuration est-elle _prête pour la production_ ? Une
application démarre parfaitement avec `NEXT_PUBLIC_SITE_URL=http://localhost:3000` —
rien n'est invalide. Simplement, les courriels de confirmation renvoient vers la
machine de l'utilisateur, et personne ne s'en aperçoit avant la première
inscription réelle.

Il distingue deux niveaux, et cette distinction est le cœur du script : une clé
Mobile Money absente n'est pas une panne — on encaisse alors par virement — et
la traiter comme telle aurait fini par apprendre à tout le monde à ignorer la
sortie.

| Niveau          | Signification                               | Code de sortie |
| --------------- | ------------------------------------------- | -------------- |
| `ERREUR`        | Le service ne fonctionnera pas correctement | 1              |
| `AVERTISSEMENT` | Fonctionnalité absente, choix légitime      | 0              |

Il attrape notamment trois pièges coûteux :

- la clé **`service_role` collée dans `NEXT_PUBLIC_SUPABASE_ANON_KEY`** — les
  deux se ressemblent et se copient depuis le même écran, mais celle-là
  contourne toutes les politiques RLS et se retrouverait inlinée dans le bundle
  client, ouvrant la base entière à quiconque lit le code source de la page ;
- un opérateur Mobile Money **configuré à moitié** : il n'apparaît alors pas
  dans la liste des moyens de paiement, et l'on cherche du côté de l'interface
  plutôt que de la variable oubliée ;
- `RESEND_API_KEY` sans `NOTIFICATIONS_CRON_SECRET`, qui laisserait
  `/api/notifications/envoi` ouverte à tous.

> ⚠️ `NEXT_PUBLIC_SITE_URL` doit être l'URL **publique définitive**, sans barre
> oblique finale. Elle sert aux liens de confirmation d'e-mail, aux redirections
> OAuth, au sitemap et aux URL canoniques. Une valeur erronée produit des liens
> d'activation qui renvoient vers `localhost` — et des comptes que personne ne
> peut confirmer.

### 3. Le domaine

Faites pointer un enregistrement `A` (ou `CNAME`) vers le serveur avant de
déployer : le certificat TLS est émis à la volée par Let's Encrypt, qui vérifie
le domaine. Sans DNS résolu, l'émission échoue et le site reste en HTTP.

---

## Déploiement automatique (GitHub Actions)

Chaque poussée sur `main` déclenche `.github/workflows/deploiement.yml`, en
trois étapes conditionnées l'une par l'autre :

| Étape        | Ce qu'elle fait                                                                   |
| ------------ | --------------------------------------------------------------------------------- |
| `verifier`   | Rejoue **toute** la CI : typage, lint, format, tests unitaires, suites SQL, image |
| `publier`    | Construit l'image et la pousse sur GHCR (`latest` **et** le SHA du commit)        |
| `declencher` | Prévient Coolify, qui tire la nouvelle image et bascule                           |

`verifier` réutilise `ci.yml` par `workflow_call` au lieu d'en recopier les
étapes : dupliquer les contrôles les aurait fatalement laissés diverger, et
c'est toujours la copie du déploiement qui s'allège.

### Pourquoi publier une image plutôt que laisser l'hébergeur construire

Construire Next.js demande environ 2 Go de mémoire. Un VPS d'entrée de gamme en
a 1 ou 2 : la construction y échoue — ou, plus pénible, y réussit en
déclenchant le tueur de mémoire du noyau au milieu d'un déploiement, laissant le
service à l'arrêt. Publier une image déjà construite déplace ce coût sur un
runner GitHub ; le serveur n'a plus qu'à tirer et démarrer.

L'étiquetage par SHA n'est pas décoratif : c'est ce qui rend un retour en
arrière possible. Avec `latest` seul, la version précédente n'a plus de nom.

### Réglages, une seule fois

**Settings → Secrets and variables → Actions**

Onglet **Variables** (valeurs non secrètes, inlinées dans le bundle client) :

| Nom                             | Exemple                     |
| ------------------------------- | --------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://xxxx.supabase.co`  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ…`                      |
| `NEXT_PUBLIC_SITE_URL`          | `https://daghoip-ikassa.ga` |

Onglet **Secrets** :

| Nom               | Où le trouver                                           |
| ----------------- | ------------------------------------------------------- |
| `COOLIFY_WEBHOOK` | Coolify → l'application → Webhooks → URL de déploiement |
| `COOLIFY_TOKEN`   | Coolify → Keys & Tokens → API tokens                    |

Le workflow **refuse de publier** si une variable de build manque : sans ce
contrôle, l'image se construirait parfaitement puis pointerait vers `localhost`
en production. Les deux secrets Coolify, eux, sont facultatifs — sans eux
l'image est publiée et la bascule reste manuelle.

> ⚠️ **Une image = un environnement.** Les `NEXT_PUBLIC_*` sont inlinées au
> build : l'image publiée est liée à un projet Supabase et à un domaine précis,
> elle n'est pas réutilisable pour une pré-production. Deux environnements
> demandent deux constructions. C'est une conséquence de Next.js, pas un choix
> qu'on pourrait défaire.

### Sans Coolify : tirer l'image sur le serveur

```bash
echo "$GITHUB_TOKEN" | docker login ghcr.io -u <utilisateur> --password-stdin
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

`docker-compose.prod.yml` **tire** l'image au lieu de la construire, et applique
le même durcissement que le fichier de développement : publication sur la seule
boucle locale, système de fichiers en lecture seule, journaux plafonnés à
3 × 10 Mo — un conteneur qui tourne des mois remplit sinon un petit disque de
VPS sans prévenir.

---

## Coolify

C'est le chemin recommandé : Coolify gère le certificat, le proxy, les
redéploiements sur `git push` et la rotation des journaux.

### Créer l'application

1. **Projects → New Resource → Public/Private Repository** ;
2. dépôt du projet, branche `main` ;
3. **Build Pack : Dockerfile** — surtout pas Nixpacks, qui ignorerait le
   `Dockerfile` fourni et perdrait la sortie `standalone`, l'utilisateur non
   privilégié et la sonde de vivacité ;
4. **Port : 3000**.

### Renseigner les variables

Dans **Environment Variables**, cochez **Build Variable** pour les trois
`NEXT_PUBLIC_*` : sans cette case, Coolify ne les transmet qu'au conteneur en
exécution, et le bundle client est construit avec des valeurs vides. L'erreur se
manifeste par un écran « Configuration invalide » au premier chargement.

| Variable                         | Build | Exécution |
| -------------------------------- | :---: | :-------: |
| `NEXT_PUBLIC_SUPABASE_URL`       |  ✅   |    ✅     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  |  ✅   |    ✅     |
| `NEXT_PUBLIC_SITE_URL`           |  ✅   |    ✅     |
| `SUPABASE_SERVICE_ROLE_KEY`      |   —   |    ✅     |
| `AIRTEL_MONEY_*`, `MOOV_MONEY_*` |   —   |    ✅     |
| `ANTHROPIC_API_KEY`              |   —   |    ✅     |

### Domaine et santé

- **Domains** : `https://votre-domaine.ga`. Coolify demande le certificat
  automatiquement.
- **Health Check Path** : `/` — l'image en déclare déjà une, Coolify la
  réutilise pour ne basculer le trafic qu'une fois l'application prête.

### Redéploiement automatique

Deux modes, au choix :

- **Coolify construit** — Webhooks → GitHub : chaque poussée sur `main`
  reconstruit et redéploie. Simple, mais la construction consomme la mémoire du
  serveur.
- **GitHub construit, Coolify tire** — configurez l'application en
  _Docker Image_ pointant sur `ghcr.io/<compte>/<depot>:latest`, et renseignez
  `COOLIFY_WEBHOOK` / `COOLIFY_TOKEN` dans le dépôt. Le serveur ne construit
  plus rien, et rien n'est publié qui n'ait passé les tests. C'est le mode
  recommandé dès que le VPS a moins de 4 Go.

Dans les deux cas, combiné à la CI, une branche qui ne passe pas les tests n'est
jamais fusionnée — donc jamais déployée.

---

## Hostinger (VPS)

Hostinger propose de l'hébergement mutualisé et des VPS. **Seul le VPS
convient** : l'hébergement mutualisé ne fait tourner que du PHP et des fichiers
statiques, il ne peut pas exécuter un serveur Node.

Prenez Ubuntu 22.04 ou 24.04. Pour la mémoire, tout dépend du mode retenu :

| Mode                                     | RAM conseillée | Pourquoi                                          |
| ---------------------------------------- | -------------- | ------------------------------------------------- |
| Image tirée depuis GHCR (**recommandé**) | 1 Go           | Le serveur ne construit rien, il exécute          |
| Construction sur le serveur              | 4 Go           | Le build Next.js consomme à lui seul environ 2 Go |

### 1. Préparer le serveur

```bash
ssh root@<ip-du-vps>

apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh

# Un utilisateur non privilégié pour l'application.
adduser --disabled-password --gecos '' ikassa
usermod -aG docker ikassa
```

### 2. Le pare-feu

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Le port 3000 n'est **pas** ouvert : le conteneur n'est joignable que par le
proxy, sur la boucle locale. L'exposer permettrait d'atteindre l'application en
HTTP en contournant le certificat.

### 3. Déployer

**Mode recommandé — tirer l'image publiée par GitHub Actions :**

```bash
su - ikassa
git clone https://github.com/<compte>/<depot>.git ikassa && cd ikassa
cp .env.example .env && nano .env      # secrets d'exécution uniquement
npm run verify:env -- --prod           # avant de démarrer, pas après

echo "$GITHUB_TOKEN" | docker login ghcr.io -u <utilisateur> --password-stdin
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Le `.env` du serveur ne porte alors **que les secrets d'exécution** : les
`NEXT_PUBLIC_*` sont déjà dans l'image, et les redéfinir ici n'aurait aucun
effet sur le bundle client.

**Mode construction sur place** (VPS à 4 Go et plus) :

```bash
cp .env.example .env && nano .env      # toutes les variables, publiques comprises
docker compose up -d --build
```

Les deux fichiers publient sur `127.0.0.1:3000` et appliquent le même
durcissement : système de fichiers en lecture seule, pas d'élévation de
privilèges, mémoire plafonnée.

### 4. Le proxy et le certificat

```bash
apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/ikassa` :

```nginx
server {
    server_name votre-domaine.ga www.votre-domaine.ga;

    # Le corps d'une requête inclut les photos d'annonces (8 Mo côté
    # application) ; la valeur par défaut de nginx est de 1 Mo et rejetterait
    # les envois avec un 413 difficile à diagnostiquer côté navigateur.
    client_max_body_size 12m;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;

        # `Upgrade` et `Connection` : la messagerie temps réel passe par
        # WebSocket. Sans ces deux en-têtes, les messages n'arrivent qu'au
        # rechargement de la page.
        proxy_set_header   Upgrade    $http_upgrade;
        proxy_set_header   Connection "upgrade";

        # L'application lit l'IP du client pour la limitation de débit.
        # Sans ces en-têtes, tous les visiteurs partagent le même compteur.
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;

        proxy_read_timeout 300s;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/ikassa /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

certbot --nginx -d votre-domaine.ga -d www.votre-domaine.ga
```

Certbot ajoute la redirection HTTP → HTTPS et installe le renouvellement
automatique.

### 5. Redémarrage au reboot

`docker-compose.yml` déclare `restart: unless-stopped` : les conteneurs
repartent seuls après un redémarrage du VPS. Vérifiez que le service Docker est
bien activé :

```bash
systemctl enable docker
```

---

## Docker seul

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ... \
  --build-arg NEXT_PUBLIC_SITE_URL=https://votre-domaine.ga \
  -t daghoip-ikassa:latest .

docker run -d --name ikassa \
  -p 127.0.0.1:3000:3000 \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  --restart unless-stopped \
  daghoip-ikassa:latest
```

---

## Après le déploiement

Une liste courte, à parcourir une fois :

- [ ] la page d'accueil s'affiche avec des annonces (le seed est bien passé) ;
- [ ] l'inscription par e-mail aboutit et le lien de confirmation pointe vers le
      bon domaine ;
- [ ] le dépôt d'une annonce avec photo fonctionne (buckets Storage en place) ;
- [ ] `/admin` est accessible au compte promu, et refusé aux autres ;
- [ ] `https://votre-domaine.ga/sitemap.xml` et `/robots.txt` répondent ;
- [ ] `https://votre-domaine.ga/manifest.webmanifest` répond, et le navigateur
      mobile propose « Ajouter à l'écran d'accueil » ;
- [ ] la bascule clair/sombre du pied de page tient au rechargement ;
- [ ] en coupant le réseau, une navigation affiche la page hors ligne et non
      l'erreur du navigateur ;
- [ ] `/compte/notifications` s'ouvre et enregistre les préférences ;
- [ ] la tâche planifiée d'envoi d'e-mails répond `200`.

### Tâches planifiées

Activez `pg_cron` côté Supabase puis rejouez
`supabase/migrations/20260801000500_performance.sql`. Sans cela, les annonces
expirées ne basculent pas et les notifications anciennes ne sont jamais purgées.

### Envoi des e-mails de notification

La file `email_outbox` est drainée par une requête HTTP : sans planificateur,
elle s'accumule sans jamais partir. Toutes les cinq minutes suffisent.

**Coolify** — _Scheduled Tasks_ sur la ressource :

```
*/5 * * * *   curl -sS -X POST http://localhost:3000/api/notifications/envoi -H "Authorization: Bearer $NOTIFICATIONS_CRON_SECRET"
```

**VPS** — `crontab -e` sous l'utilisateur `ikassa` :

```cron
*/5 * * * * curl -sS -X POST http://127.0.0.1:3000/api/notifications/envoi -H "Authorization: Bearer VOTRE_SECRET" >/dev/null
```

La route répond `200 {"skipped":true}` tant qu'aucun fournisseur n'est
configuré : le planificateur ne sonnera pas l'alerte pour une configuration
volontaire.

### Rappels des opérateurs Mobile Money

Déclarez chez l'opérateur l'URL correspondante — et seulement une fois les
identifiants renseignés, sans quoi la route répond 404 :

```
https://votre-domaine.ga/api/paiements/airtel_money/callback
https://votre-domaine.ga/api/paiements/moov_money/callback
```

---

## Mise à jour

**Avec GitHub Actions** : poussez sur `main`. Les tests tournent, l'image est
publiée, Coolify bascule. Rien d'autre à faire.

**VPS, image tirée** :

```bash
cd ~/ikassa
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f   # les couches de l'ancienne image
```

**VPS, construction sur place** :

```bash
cd ~/ikassa && git pull && docker compose up -d --build
docker image prune -f
```

**Revenir en arrière.** Chaque déploiement publie aussi l'image sous le SHA du
commit, c'est ce qui rend le retour possible :

```bash
IMAGE_TAG=sha-<empreinte> docker compose -f docker-compose.prod.yml up -d
```

Les migrations SQL, elles, ne sont **jamais** rejouées automatiquement : elles
touchent des données. Appliquez-les explicitement (`npx supabase db push`) avant
de déployer le code qui en dépend.

---

## En cas de problème

**« Configuration invalide : variables d'environnement publiques manquantes »**
Les `NEXT_PUBLIC_*` n'étaient pas présentes **au build**. Sur Coolify, cochez
« Build Variable » ; en Docker, passez-les en `--build-arg`. Reconstruisez : les
renseigner à l'exécution ne suffit pas.

**Les liens de confirmation d'e-mail pointent vers `localhost`**
`NEXT_PUBLIC_SITE_URL` est absente ou erronée au build. Corrigez-la et
reconstruisez, puis vérifiez les URL de redirection dans Supabase
(Authentication → URL Configuration).

**Les messages n'arrivent qu'au rechargement**
Le proxy ne transmet pas la mise à niveau WebSocket. Vérifiez les en-têtes
`Upgrade` et `Connection` de la configuration nginx.

**Toute la plateforme est limitée en débit d'un coup**
Le proxy ne transmet pas `X-Forwarded-For` : tous les visiteurs partagent le
compteur de l'adresse du proxy. Ajoutez les en-têtes `X-Real-IP` et
`X-Forwarded-For`.

**Le build échoue par manque de mémoire**
Un VPS à 1 Go ne suffit pas pour construire. Passez au mode image tirée :
GitHub Actions construit, le serveur se contente d'exécuter. Voir
[Déploiement automatique](#déploiement-automatique-github-actions).

**Le workflow s'arrête sur « Variables de dépôt manquantes »**
C'est le contrôle qui fait son travail. Les trois `NEXT_PUBLIC_*` se règlent
dans Settings → Secrets and variables → Actions, onglet **Variables** — et non
dans l'onglet Secrets, où le workflow ne les lit pas.

**`docker compose pull` renvoie « denied »**
Le paquet GHCR est privé par défaut. Soit vous vous authentifiez sur le serveur
avec un jeton portant la portée `read:packages`, soit vous rendez le paquet
public depuis la page du dépôt (Packages → Package settings → Change
visibility).

**Le déploiement passe au vert mais rien ne change en production**
Le webhook Coolify a répondu une erreur HTTP absorbée en silence. Le workflow
utilise `curl -f`, qui échoue sur une réponse d'erreur : vérifiez que
`COOLIFY_TOKEN` est valide et que l'URL du webhook désigne la bonne
application.

**Une ancienne version reste servie après mise à jour**
C'est le service worker. Il se met à jour au prochain chargement complet ; le
fichier `/sw.js` lui-même n'est jamais mis en cache (en-tête `no-store`), donc
un rechargement forcé suffit toujours à repartir sur la version courante.
