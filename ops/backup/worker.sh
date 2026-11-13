#!/bin/sh
set -eu
while :; do
  /usr/local/bin/ledger-once.sh
  last=0
  if [ -f /backups/last-success ]; then last=$(cat /backups/last-success); fi
  now=$(date +%s)
  if [ $((now - last)) -ge 82800 ]; then /usr/local/bin/backup-once.sh; fi
  sleep 3600
done
