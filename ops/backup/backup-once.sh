#!/bin/sh
set -eu
set -o pipefail
umask 077
: "${BACKUP_AGE_RECIPIENT:?Set the public age recipient}"
: "${PGDATABASE:?Set the source database}"
case "$PGDATABASE" in ''|*[!a-zA-Z0-9_]*) echo 'Invalid database name' >&2; exit 1;; esac
exec 9>/backups/.backup.lock
flock -n 9 || exit 0
partial=$(mktemp /backups/.partial-XXXXXX)
trap 'rm -f "$partial"' EXIT
stamp=$(date -u +%Y%m%dT%H%M%SZ)
suffix=${partial##*/.partial-}
file="/backups/sibol-$stamp-$suffix.dump.age"
pg_dump --format=custom --no-owner --no-acl | age --recipient "$BACKUP_AGE_RECIPIENT" > "$partial"
mv "$partial" "$file"
sha256sum "$file" > "$file.sha256"
printf '{"format":"sibol-backup-v1","database":"%s","createdAt":"%s","retentionDays":30,"postgresMajor":17}\n' "$PGDATABASE" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$file.json"
date +%s > /backups/last-success
find /backups -maxdepth 1 -type f -name 'sibol-*.dump.age' -mtime +29 -print | while IFS= read -r expired; do
  rm -f "$expired" "$expired.sha256" "$expired.json"
done
printf '{"event":"backup_complete","archive":"%s"}\n' "${file##*/}"
