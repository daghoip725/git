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

echo
echo "==> Terminé"
