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

echo "==> Création de la base et du contexte Supabase simulé"
psql -q -c "create database $DBNAME;"
psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 \
  -c "create extension if not exists pgcrypto;" \
  -f "$SCRIPT_DIR/00_supabase_shim.sql" >/dev/null

echo "==> Application des migrations"
for migration in "$PROJECT_DIR"/supabase/migrations/*.sql; do
  echo "    - $(basename "$migration")"
  psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
done

echo "==> Chargement des données de référence"
psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$PROJECT_DIR/supabase/seed.sql" >/dev/null

# Chaque suite part d'une base vierge : les tests d'authentification créent
# leurs propres comptes et supposent qu'aucun administrateur n'existe encore.
for suite in "$SCRIPT_DIR"/0[1-9]_*.sql; do
  echo
  echo "==> Suite : $(basename "$suite")"

  psql -q -c "drop database if exists $DBNAME;" -c "create database $DBNAME;" >/dev/null
  psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 \
    -c "create extension if not exists pgcrypto;" \
    -f "$SCRIPT_DIR/00_supabase_shim.sql" >/dev/null
  for migration in "$PROJECT_DIR"/supabase/migrations/*.sql; do
    psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done
  psql -q -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$PROJECT_DIR/supabase/seed.sql" >/dev/null

  psql -d "$DBNAME" -v ON_ERROR_STOP=1 -f "$suite" 2>&1 \
    | grep -E "OK  |ECHEC|ERROR|^---|TOUS|TESTS" \
    | sed 's/^psql.*NOTICE: *//'
done

echo
echo "==> Terminé"
