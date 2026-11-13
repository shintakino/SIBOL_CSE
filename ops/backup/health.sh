#!/bin/sh
set -eu
[ -f /backups/last-success ] && [ -f /backups/deletions.json.age ]
now=$(date +%s)
last=$(cat /backups/last-success)
ledger=$(stat -c %Y /backups/deletions.json.age)
[ $((now-last)) -lt 93600 ] && [ $((now-ledger)) -lt 7200 ]
