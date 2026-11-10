#!/bin/sh
# Creates the read-only role `arena_qa` students use to inspect the shop data (lesson 2.5) and
# the empty `tienda` schema the API fills with views on every session (re)start. The role gets
# no access to the real session schemas, to arena_meta or to the tokens / arena_counters
# tables. Runs once per new volume: after changing it, `docker compose down -v`.
# The password is a public practice value, not a secret: the Arena is isolated.
set -euo pipefail

: "${ARENA_QA_PASSWORD:?ARENA_QA_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 -v qapw="$ARENA_QA_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE ROLE arena_qa LOGIN PASSWORD :'qapw' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 5;
-- 01-app-role.sh already did REVOKE ALL ... FROM PUBLIC (so no TEMP either).
GRANT CONNECT ON DATABASE :"DBNAME" TO arena_qa;
CREATE SCHEMA tienda AUTHORIZATION arena_app;
GRANT USAGE ON SCHEMA tienda TO arena_qa;
ALTER ROLE arena_qa SET search_path = tienda;
-- Convenience only; the real guarantee is that the role has just SELECT on the views.
ALTER ROLE arena_qa SET default_transaction_read_only = on;
ALTER ROLE arena_qa SET statement_timeout = '3s';
SQL
