# PostgreSQL 16 with PostGIS 3, built from the Debian packages so the image
# runs natively on both amd64 and arm64 (the postgis/postgis image is amd64 only).
FROM postgres:16-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-16-postgis-3 postgresql-16-postgis-3-scripts \
    && rm -rf /var/lib/apt/lists/*

COPY init-postgis.sh /docker-entrypoint-initdb.d/10-postgis.sh
