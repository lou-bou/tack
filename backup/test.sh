#!/bin/sh
# Self-test for backup.sh and restore.sh: `make test-backup`. Uses a throwaway database
# and a local rclone remote, so it never touches real data or Google Drive.
set -eu

T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
export DB_PATH="$T/data/tack.db" BACKUP_DIR="$T/backups" RCLONE_REMOTE=":local"
export RCLONE_PATH="$T/remote" RCLONE_CONFIG="$T/rclone.conf" BACKUP_RETENTION_DAYS=30
mkdir -p "$T/data" "$T/backups" "$T/remote"
: > "$RCLONE_CONFIG"

pass() { echo "PASS  $1"; }
die() { echo "FAIL  $1" >&2; exit 1; }
count() { sqlite3 "$DB_PATH" 'SELECT count(*) FROM t;'; }
field() { sed -n "s/.*\"$1\": *\(.*\),\{0,1\}$/\1/p" "$BACKUP_DIR/status.json" | sed 's/,$//'; }

sqlite3 "$DB_PATH" "PRAGMA journal_mode=WAL; CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2), (3);
  CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);" > /dev/null

# Files from 31 days ago, locally and on the remote, must be pruned; 29 days must stay.
old=$(date -d "@$(($(date +%s) - 31 * 86400))" +%Y%m%d%H%M)
recent=$(date -d "@$(($(date +%s) - 29 * 86400))" +%Y%m%d%H%M)
for dir in "$BACKUP_DIR" "$RCLONE_PATH"; do
  touch -t "$old" "$dir/tack-old.db.gz"
  touch -t "$recent" "$dir/tack-recent.db.gz"
done

backup.sh > /dev/null || die "backup run exited non-zero"
made=$(ls "$BACKUP_DIR" | grep '^tack-[0-9].*\.db\.gz$' | head -n 1)
[ -n "$made" ] || die "no local backup file"
pass "local file $made"
[ -f "$RCLONE_PATH/$made" ] || die "not uploaded to the remote"
pass "uploaded to the remote"
[ ! -e "$BACKUP_DIR/tack-old.db.gz" ] && [ ! -e "$RCLONE_PATH/tack-old.db.gz" ] || die "31-day-old files not pruned"
[ -e "$BACKUP_DIR/tack-recent.db.gz" ] && [ -e "$RCLONE_PATH/tack-recent.db.gz" ] || die "29-day-old files pruned"
pass "pruned files older than 30 days in both places"
[ "$(field error)" = "null" ] && [ "$(field file)" = "\"$made\"" ] || die "status.json: $(cat "$BACKUP_DIR/status.json")"
success=$(field lastSuccessAt)
pass "status.json records the success"

# A failed run reports the error and keeps the last success.
if RCLONE_REMOTE="" backup.sh > /dev/null 2>&1; then die "run without a remote should fail"; fi
[ "$(field error)" != "null" ] && [ "$(field lastSuccessAt)" = "$success" ] || die "failed run status: $(cat "$BACKUP_DIR/status.json")"
pass "failed run reports the error and keeps the last success"

# Restore brings back the snapshot and keeps the replaced database.
sqlite3 "$DB_PATH" 'INSERT INTO t VALUES (4);'
[ "$(count)" = 4 ] || die "setup"
restore.sh "$BACKUP_DIR/$made" > /dev/null || die "restore exited non-zero"
[ "$(count)" = 3 ] || die "restored database has $(count) rows, expected 3"
ls "$T/data" | grep -q '^before-restore-.*\.db$' || die "previous database not kept"
pass "restore brings back the snapshot and keeps the previous database"
[ "$(sqlite3 "$DB_PATH" "SELECT count(*) FROM meta WHERE key = 'epoch' AND value > 0;")" = 1 ] || die "epoch not set"
pass "restore sets a new epoch, so devices know to start over"
if restore.sh "$BACKUP_DIR/tack-recent.db.gz" > /dev/null 2>&1; then die "restoring a bad file should fail"; fi
[ "$(count)" = 3 ] || die "bad restore changed the database"
pass "a corrupt backup is refused without touching the database"

echo "All backup checks passed."
