#!/bin/sh
set -eu
set -o pipefail
: "${RESTORE_DATABASE:?Set a new target ending in _restore}"
: "${BACKUP_FILE:?Set an archive basename}"
case "$RESTORE_DATABASE" in *_restore) ;; *) echo 'Restore only targets a new *_restore database' >&2; exit 1;; esac
case "$RESTORE_DATABASE" in ''|*[!a-zA-Z0-9_]*) echo 'Invalid restore database name' >&2; exit 1;; esac
case "$BACKUP_FILE" in */*|'') echo 'Use an archive basename, not a path' >&2; exit 1;; sibol-*.dump.age) ;; *) exit 1;; esac
file="/backups/$BACKUP_FILE"
[ -f "$file" ] && [ -f "$file.sha256" ] && [ -f /backups/deletions.json.age ]
sha256sum -c "$file.sha256" >/dev/null
# Refuse expired archives. The decryption key is mounted only into this tools profile.
now=$(date +%s)
[ $((now-$(stat -c %Y "$file"))) -lt 2592000 ] || { echo 'Archive is beyond 30-day retention' >&2; exit 1; }
createdb --maintenance-db=postgres --template=template0 "$RESTORE_DATABASE"
age --decrypt --identity /run/secrets/backup-key "$file" | pg_restore --exit-on-error --single-transaction --no-owner --no-acl --dbname "$RESTORE_DATABASE"
printf '{"event":"restored_offline","next":"reconcile deletion receipts and verify before cutover"}\n'
