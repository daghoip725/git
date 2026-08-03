# Déploiement de Daghoip Ikassa

Trois chemins, du plus simple au plus manuel. Tous partent du même dépôt Git et
de la même image Docker : ce qui tourne en production est exactement ce que la
CI a construit.

1. [Avant de commencer](#avant-de-commencer)
2. [Coolify](#coolify)
3. [Hostinger (VPS)](#hostinger-vps)
4. [Docker seul](#docker-seul)
5. [Après le déploiement](#après-le-déploiement)
6. [Mise à jour](#mise-à-jour)
7. [En cas de problème](#en-cas-de-problème)

---

## Avant de commencer

### 1. Le projet Supabase

L'application ne fonctionne pas sans base. Créez le projet, puis rejouez dans
l'ordre les douze migrations de `supabase/migrations/`, suivies de
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

**Webhooks → GitHub** : chaque poussée sur `main` reconstruit et redéploie.
Combiné à la CI, une branche qui ne passe pas les tests n'est jamais fusionnée,
donc jamais déployée.

---

## Hostinger (VPS)

Hostinger propose de l'hébergement mutualisé et des VPS. **Seul le VPS
convient** : l'hébergement mutualisé ne fait tourner que du PHP et des fichiers
statiques, il ne peut pas exécuter un serveur Node.

Prenez un VPS avec au moins 2 Go de RAM (le build Next.js en consomme ~1,5 Go)
et Ubuntu 22.04 ou 24.04.

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

```bash
su - ikassa
git clone https://github.com/<compte>/<depot>.git ikassa && cd ikassa
cp .env.example .env && nano .env      # renseignez les variables

docker compose up -d --build
```

`docker-compose.yml` publie sur `127.0.0.1:3000` et applique déjà le
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
      l'erreur du navigateur.

### Tâches planifiées

Activez `pg_cron` côté Supabase puis rejouez
`supabase/migrations/20260801000500_performance.sql`. Sans cela, les annonces
expirées ne basculent pas et les notifications anciennes ne sont jamais purgées.

### Rappels des opérateurs Mobile Money

Déclarez chez l'opérateur l'URL correspondante — et seulement une fois les
identifiants renseignés, sans quoi la route répond 404 :

```
https://votre-domaine.ga/api/paiements/airtel_money/callback
https://votre-domaine.ga/api/paiements/moov_money/callback
```

---

## Mise à jour

**Coolify** : poussez sur `main`, le webhook fait le reste.

**VPS** :

```bash
cd ~/ikassa && git pull && docker compose up -d --build
docker image prune -f   # les couches de l'ancienne image
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
Un VPS à 1 Go ne suffit pas. Ajoutez du swap ou, mieux, construisez l'image en
CI et ne déployez qu'une image déjà prête.

**Une ancienne version reste servie après mise à jour**
C'est le service worker. Il se met à jour au prochain chargement complet ; le
fichier `/sw.js` lui-même n'est jamais mis en cache (en-tête `no-store`), donc
un rechargement forcé suffit toujours à repartir sur la version courante.
