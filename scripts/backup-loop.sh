#!/bin/sh
# Runs inside the `backup` compose service (postgres image): one pg_dump per day into
# /backups, keeping BACKUP_KEEP_DAYS days. Custom format (-Fc): compressed, restorable table by
# table with pg_restore, and portable to a new database for the future back-end split.
set -eu

KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
HOUR="${BACKUP_HOUR:-02}"

dump() {
  file="/backups/admin_funca-$(date +%Y%m%d-%H%M%S).dump"
  if pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$file.partial"; then
    mv "$file.partial" "$file"
    echo "backup ok: $file ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.partial"
    echo "backup FAILED at $(date)" >&2
  fi
  find /backups -name 'admin_funca-*.dump' -mtime "+$KEEP_DAYS" -delete
}

# One dump on start, then every day at HOUR:00 (container time zone).
dump
while true; do
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) $HOUR:00:00" +%s 2>/dev/null || echo 0)
  [ "$next" -le "$now" ] && next=$((next + 86400))
  [ "$next" -le 86400 ] && next=$((now + 86400)) # date -d unsupported: fall back to every 24 h
  sleep $((next - now))
  dump
done
