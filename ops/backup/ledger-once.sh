#!/bin/sh
set -eu
set -o pipefail
umask 077
: "${BACKUP_AGE_RECIPIENT:?Set the public age recipient}"
partial=$(mktemp /backups/.ledger-XXXXXX)
trap 'rm -f "$partial"' EXIT
psql -X -v ON_ERROR_STOP=1 -Atc "SELECT coalesce(json_agg(r),'[]'::json) FROM (SELECT user_id AS \"userId\", receipt_id AS \"receiptId\", deleted_at AS \"deletedAt\" FROM deletion_receipt ORDER BY user_id) r" | age --recipient "$BACKUP_AGE_RECIPIENT" > "$partial"
mv "$partial" /backups/deletions.json.age
printf '{"event":"deletion_ledger_saved"}\n'
