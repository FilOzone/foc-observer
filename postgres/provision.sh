#!/bin/sh
# Provision the restricted query role and apply bootstrap DDL to each database.
# Runs as a one-shot before foc-observer starts, so the server itself never
# needs owner credentials.
set -eu

: "${FOC_QUERY_DATABASE_PASSWORD:=foc-observer}"

for host in "$@"; do
  psql \
    --host "$host" \
    --username ponder \
    --dbname ponder \
    --set ON_ERROR_STOP=1 \
    --set query_password="$FOC_QUERY_DATABASE_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE foc_observer_query LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'foc_observer_query') \gexec

ALTER ROLE foc_observer_query WITH
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS
  CONNECTION LIMIT 24
  PASSWORD :'query_password';
ALTER ROLE foc_observer_query SET default_transaction_read_only = on;
ALTER ROLE foc_observer_query SET statement_timeout = '30s';
ALTER ROLE foc_observer_query SET lock_timeout = '5s';
ALTER ROLE foc_observer_query SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE foc_observer_query SET temp_file_limit = '256MB';
-- Analytical sorts under the server's cursor wrapper spill to disk at the 4MB
-- default and abort on temp_file_limit.
ALTER ROLE foc_observer_query SET work_mem = '64MB';
ALTER ROLE foc_observer_query SET search_path = public;

REVOKE TEMPORARY ON DATABASE ponder FROM PUBLIC;
GRANT CONNECT ON DATABASE ponder TO foc_observer_query;
SQL

  # Grants live in bootstrap.sql so they are reapplied alongside the view after
  # a reindex drops and recreates public.
  psql \
    --host "$host" \
    --username ponder \
    --dbname ponder \
    --set ON_ERROR_STOP=1 \
    --file /usr/local/share/foc/bootstrap.sql
done
