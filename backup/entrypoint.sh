#!/bin/sh
# Schedule backup.sh with supercronic. With arguments, run them instead (restore, test, one-off).
set -eu
if [ "$#" -gt 0 ]; then exec "$@"; fi
echo "${BACKUP_CRON:-0 3 * * *} /usr/local/bin/backup.sh" > /tmp/crontab
echo "tack-backup: schedule '${BACKUP_CRON:-0 3 * * *}' (TZ=${TZ:-UTC})"
# Absolute path: as PID 1, supercronic re-executes itself by argv[0] to reap child processes.
exec "$(command -v supercronic)" /tmp/crontab
