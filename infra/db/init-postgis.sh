#!/bin/sh
# Installs PostGIS into the template database and the default database, so every
# schema (including the per-test ones) can use it through the public schema.
set -e
for db in template1 "$POSTGRES_DB"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" \
    -c "create extension if not exists postgis;"
done
