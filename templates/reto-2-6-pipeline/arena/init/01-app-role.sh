#!/bin/sh
# Creates the unprivileged role the API connects with (review H7). The superuser
# (POSTGRES_USER) is only used here, at first container start. Runs once per new volume:
# after changing it, recreate the volume with `docker compose down -v`.
set -eu

: "${ARENA_APP_PASSWORD:?ARENA_APP_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 -v pw="$ARENA_APP_PASSWORD" -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
CREATE ROLE arena_app LOGIN PASSWORD :'pw' NOSUPERUSER NOCREATEDB NOCREATEROLE;
-- arena_app creates and owns arena_meta, the template schema and every session schema.
REVOKE ALL ON DATABASE :"DBNAME" FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE :"DBNAME" TO arena_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
