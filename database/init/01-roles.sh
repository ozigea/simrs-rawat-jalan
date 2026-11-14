#!/bin/bash
# Runs once, on first initialisation of the data volume (docker-entrypoint-initdb.d).
# Schema is owned by Yii migrations; this only creates roles, database and extensions.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v core_pw="$SIMRS_CORE_PASSWORD" -v service_pw="$SIMRS_SERVICE_PASSWORD" -v dbname="$APP_DB_NAME" -v tz="$APP_TIMEZONE" <<'EOSQL'
CREATE ROLE simrs_core LOGIN PASSWORD :'core_pw';
CREATE ROLE simrs_service LOGIN PASSWORD :'service_pw';
CREATE DATABASE :"dbname" OWNER simrs_core;
REVOKE ALL ON DATABASE :"dbname" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"dbname" TO simrs_service;
ALTER DATABASE :"dbname" SET timezone TO :'tz';
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$APP_DB_NAME" <<'EOSQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;
EOSQL
