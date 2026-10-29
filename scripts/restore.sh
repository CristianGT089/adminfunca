#!/bin/sh
# Restores a dump made by backup.sh / the backup service INTO THE CURRENT DATABASE, replacing
# what is there. Usage: ./scripts/restore.sh backups/admin_funca-YYYYMMDD-HHMMSS.dump
# Stop the app first (docker compose stop app) so nobody writes during the restore.
set -eu
file="${1:?Usage: $0 <file.dump>}"
[ -f "$file" ] || { echo "No such file: $file" >&2; exit 1; }
printf 'This REPLACES the data in the database with %s. Type "restore" to continue: ' "$file"
read -r answer
[ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$file"
echo "Restored $file."
