#!/bin/sh
# One backup run: consistent snapshot, gzip, local copy, rclone upload, 30-day prune,
# then status.json for the app. A failed run keeps the previous success in status.json.
set -u

DB=${DB_PATH:-/data/tack.db}
OUT=${BACKUP_DIR:-/backups}
STATUS=$OUT/status.json
RETENTION=${BACKUP_RETENTION_DAYS:-30}
REMOTE=${RCLONE_REMOTE:-}
RPATH=${RCLONE_PATH:-tack-backups}

stamp=$(date +%Y-%m-%d-%H%M%S)
name="tack-$stamp.db.gz"
tmp="$OUT/.tack-$stamp.db"
attempt=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Previous values, kept when this run fails.
prev() {
  v=$(sed -n "s/.*\"$1\": *\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" "$STATUS" 2>/dev/null | head -n 1)
  [ "$v" = "null" ] || printf '%s' "$v"
}
last_success=$(prev lastSuccessAt)
size=$(prev sizeBytes)
file=$(prev file)

json_str() {
  if [ -z "$1" ]; then printf 'null'; else printf '"%s"' "$(printf '%s' "$1" | tr '\n' ' ' | sed 's/\\/\\\\/g; s/"/\\"/g')"; fi
}

write_status() {
  {
    printf '{\n'
    printf '  "lastSuccessAt": %s,\n' "$(json_str "$last_success")"
    printf '  "lastAttemptAt": "%s",\n' "$attempt"
    printf '  "sizeBytes": %s,\n' "${size:-null}"
    printf '  "file": %s,\n' "$(json_str "$file")"
    printf '  "error": %s\n' "$(json_str "$1")"
    printf '}\n'
  } > "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"
}

fail() {
  rm -f "$tmp" "$tmp.gz"
  write_status "$1"
  echo "tack-backup: FAILED: $1" >&2
  exit 1
}

mkdir -p "$OUT" || { echo "tack-backup: cannot create $OUT" >&2; exit 1; }
[ -f "$DB" ] || fail "Database not found at $DB"

# .backup goes through SQLite, so it is consistent even while the app is writing (WAL).
err=$(sqlite3 "$DB" ".backup '$tmp'" 2>&1) || fail "Snapshot failed: $err"
check=$(sqlite3 "$tmp" 'PRAGMA integrity_check;' 2>&1)
[ "$check" = "ok" ] || fail "Snapshot integrity check failed: $check"
gzip -9 "$tmp" || fail "Compression failed"
mv "$tmp.gz" "$OUT/$name" || fail "Could not write $OUT/$name"

# Local prune: same rule as rclone --min-age (older than N days).
find "$OUT" -maxdepth 1 -name 'tack-*.db.gz' -mmin +$((RETENTION * 1440)) -exec rm -f {} \;

[ -n "$REMOTE" ] || fail "RCLONE_REMOTE is not set; $name was saved locally only"
err=$(rclone copy "$OUT/$name" "$REMOTE:$RPATH" 2>&1) || fail "Upload to $REMOTE:$RPATH failed: $err"
err=$(rclone delete "$REMOTE:$RPATH" --min-age "${RETENTION}d" --include 'tack-*.db.gz' 2>&1) ||
  fail "Remote prune failed: $err"

last_success=$attempt
size=$(wc -c < "$OUT/$name" | tr -d ' ')
file=$name
write_status ""
echo "tack-backup: ok $name ($size bytes) -> $OUT and $REMOTE:$RPATH"
