#!/usr/bin/env bash
#
# Vérifie le schéma Supabase contre un PostgreSQL local, hors ligne.
#
#   ./supabase/tests/run.sh
#
# Le script démarre une instance PostgreSQL jetable, y rejoue toutes les
# migrations puis la suite de tests fonctionnels et de sécurité.
# Prérequis : PostgreSQL 15+ avec les extensions pgcrypto, unaccent,
# pg_trgm et btree_gin (paquet `postgresql-contrib`).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"

PGDATA="${PGDATA:-$(mktemp -d)/pgdata}"
PGPORT="${PGPORT:-55432}"
PGSOCKET="${PGSOCKET:-/var/tmp}"
DBNAME=daghoip_test

cleanup() {
  pg_ctl -D "$PGDATA" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$PGDATA"
}
trap cleanup EXIT

echo "==> Initialisation d'une instance PostgreSQL jetable"
mkdir -p "$PGDATA"
initdb -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null

echo "==> Démarrage (port $PGPORT)"
pg_ctl -D "$PGDATA" -l "$PGDATA/server.log" -o "-p $PGPORT -k $PGSOCKET" start >/dev/null
sleep 2

export PGHOST="$PGSOCKET" PGPORT PGUSER=postgres

# Reconstruit une base complète : contexte Supabase, migrations, données de
# référence. Une seule fonction pour la préparation initiale **et** pour la
# remise à zéro entre deux suites : les deux versions existaient en double, et
# elles avaient divergé — la seconde installait encore pgcrypto dans `public`,
# si bien qu'une suite passait ou échouait selon l'endroit d'où venait sa base.
#
# pgcrypto va dans le schéma `extensions`, comme sur Supabase, et non dans
# `public`. La nuance n'est pas cosmétique : installée dans `public`, elle rend
# `extensions.digest(...)` introuvable ici alors que l'appel est correct en
# production, et à l'inverse elle laisserait passer un appel non qualifié qui,
# lui, échouerait chez Supabase. Le harnais doit reproduire la disposition
# réelle, sans quoi il valide autre chose que ce qu'on déploie.
build_database() {
  psql -q -c "drop database if exists $DBNAME;" -c "create database $DBNAME;" >/dev/null
  psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 \
    -c "create schema if not exists extensions;" \
    -c "create extension if not exists pgcrypto with schema extensions;" \
    -f "$SCRIPT_DIR/00_supabase_shim.sql" >/dev/null

  for migration in "$PROJECT_DIR"/supabase/migrations/*.sql; do
    [ "${1:-}" = "verbeux" ] && echo "    - $(basename "$migration")"
    psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done

  psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$PROJECT_DIR/supabase/seed.sql" >/dev/null
}

echo "==> Création de la base, application des migrations et des données de référence"
build_database verbeux

# Chaque suite part d'une base vierge : les tests d'authentification créent
# leurs propres comptes et supposent qu'aucun administrateur n'existe encore.
# `[0-9][0-9]_` et non `0[1-9]_` : la dixième suite existe, et le motif
# précédent l'aurait ignorée en silence — le pire mode d'échec pour une suite
# de tests, qui passe alors au vert sans avoir rien exécuté.
for suite in "$SCRIPT_DIR"/[0-9][0-9]_*.sql; do
  # Le fichier 00 est le simulacre Supabase, chargé plus haut, pas une suite.
  [ "$(basename "$suite")" = "00_supabase_shim.sql" ] && continue

  echo
  echo "==> Suite : $(basename "$suite")"

  build_database

  psql -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$suite" 2>&1 \
    | grep -E "OK  |ECHEC|ERROR|^---|TOUS|TESTS" \
    | sed 's/^psql.*NOTICE: *//'
done

# ---------------------------------------------------------------------------
#  Intégration : le typage TypeScript décrit-il la base réelle ?
# ---------------------------------------------------------------------------
#  `types/database.ts` est un miroir écrit à la main, et un miroir dérive. On
#  interroge la base qu'on vient de construire, puis on compare. C'est ici et
#  nulle part ailleurs : le test a besoin d'un PostgreSQL, il appartient donc à
#  la suite d'intégration, pas aux tests unitaires.
echo
echo "==> Introspection du schéma"
build_database

# Le dossier du projet n'est pas forcément accessible en écriture à
# l'utilisateur qui exécute ce script (`initdb` refuse root, d'où un compte
# dédié). L'introspection va donc dans un fichier temporaire, dont le chemin
# est transmis au test.
SCHEMA_JSON="${SCHEMA_JSON:-$(mktemp -t ikassa-schema-XXXXXX.json)}"
psql -q -A -t -d "$DBNAME" -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/introspection.sql" > "$SCHEMA_JSON"

echo "==> Conformité du typage TypeScript"

# `--experimental-strip-types` demande Node 22. Le `node` du PATH n'est pas
# forcément celui du projet : ce script tourne sous un utilisateur dédié
# (`initdb` refuse root), dont l'environnement peut pointer sur une version plus
# ancienne. On le vérifie explicitement plutôt que d'échouer sur un « bad option »
# incompréhensible — ou, pire, de sauter la vérification en silence.
NODE_BIN="${NODE_BIN:-node}"
NODE_MAJEURE="$("$NODE_BIN" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"

if [ "$NODE_MAJEURE" -lt 22 ]; then
  echo "ERREUR : Node 22+ requis pour la conformité du typage (trouvé : ${NODE_MAJEURE:-aucun})."
  echo "         Indiquez le binaire : NODE_BIN=/chemin/vers/node ./supabase/tests/run.sh"
  exit 1
fi

# Surtout pas de `|| true` ici : une divergence entre le typage et la base doit
# faire échouer la suite. Un test qu'on laisse passer en silence ne protège plus
# rien — c'est la panne la plus coûteuse d'une suite de tests.
(cd "$PROJECT_DIR" && IKASSA_SCHEMA_JSON="$SCHEMA_JSON" "$NODE_BIN" --experimental-strip-types \
   --import ./tests/register.mjs --test 'tests/integration/*.test.mts') \
  | grep -E "^ *(not )?ok|# (pass|fail)"

echo "  TYPAGE ET DOCUMENTATION CONFORMES AU SCHÉMA"

echo
echo "==> Terminé"
