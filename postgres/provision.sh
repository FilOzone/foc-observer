#!/bin/sh
# Provision the restricted query role and apply its grants to each database.
set -eu

OWNER_ROLE=ponder
QUERY_ROLE=foc_observer_query
BOOTSTRAP_SQL=${FOC_BOOTSTRAP_SQL:-/usr/local/share/foc/bootstrap.sql}

: "${FOC_DATABASE_OWNER_PASSWORD:?set FOC_DATABASE_OWNER_PASSWORD}"
: "${FOC_QUERY_DATABASE_PASSWORD:?set FOC_QUERY_DATABASE_PASSWORD}"
: "${FOC_DATABASE_OWNER_PREVIOUS_PASSWORD:=}"

if [ "$OWNER_ROLE" = "$QUERY_ROLE" ] || [ "$FOC_DATABASE_OWNER_PASSWORD" = "$FOC_QUERY_DATABASE_PASSWORD" ]; then
  echo "database owner and query role credentials must differ" >&2
  exit 1
fi

connect() {
  PGPASSWORD=$1 psql --host "$2" --username "$OWNER_ROLE" --dbname ponder --quiet --tuples-only --no-align \
    --set ON_ERROR_STOP=1 --command "SELECT 1" >/dev/null
}

for host in "$@"; do
  owner_password=$FOC_DATABASE_OWNER_PASSWORD
  if ! connect "$owner_password" "$host"; then
    if [ -z "$FOC_DATABASE_OWNER_PREVIOUS_PASSWORD" ] || ! connect "$FOC_DATABASE_OWNER_PREVIOUS_PASSWORD" "$host"; then
      echo "cannot connect to $host as $OWNER_ROLE with the configured owner password" >&2
      exit 1
    fi
    owner_password=$FOC_DATABASE_OWNER_PREVIOUS_PASSWORD
  fi

  if [ "$owner_password" != "$FOC_DATABASE_OWNER_PASSWORD" ]; then
    PGPASSWORD=$owner_password psql \
      --host "$host" \
      --username "$OWNER_ROLE" \
      --dbname ponder \
      --set ON_ERROR_STOP=1 \
      --set owner_role="$OWNER_ROLE" <<'SQL'
\getenv owner_password FOC_DATABASE_OWNER_PASSWORD
ALTER ROLE :"owner_role" PASSWORD :'owner_password';
SQL
  fi

  PGPASSWORD=$FOC_DATABASE_OWNER_PASSWORD psql \
    --host "$host" \
    --username "$OWNER_ROLE" \
    --dbname ponder \
    --set ON_ERROR_STOP=1 \
    --set query_role="$QUERY_ROLE" <<'SQL'
\getenv query_password FOC_QUERY_DATABASE_PASSWORD
SELECT format('CREATE ROLE %I LOGIN', :'query_role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'query_role') \gexec

ALTER ROLE :"query_role" WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS
  CONNECTION LIMIT 24
  PASSWORD :'query_password';
ALTER ROLE :"query_role" SET default_transaction_read_only = on;
ALTER ROLE :"query_role" SET statement_timeout = '30s';
ALTER ROLE :"query_role" SET lock_timeout = '5s';
ALTER ROLE :"query_role" SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE :"query_role" SET temp_file_limit = '256MB';
ALTER ROLE :"query_role" SET work_mem = '64MB';
ALTER ROLE :"query_role" SET search_path = public;
SQL

  PGPASSWORD=$FOC_DATABASE_OWNER_PASSWORD psql \
    --host "$host" \
    --username "$OWNER_ROLE" \
    --dbname ponder \
    --set ON_ERROR_STOP=1 \
    --file "$BOOTSTRAP_SQL"
done
