#!/bin/sh
# Manual backup now: ./scripts/backup.sh  → backups/admin_funca-YYYYMMDD-HHMMSS.dump
# Uses the compose `db` service; run it from the project root on the server.
set -eu
mkdir -p backups
file="backups/admin_funca-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file.partial"
mv "$file.partial" "$file"
echo "Backup: $file ($(du -h "$file" | cut -f1))"
