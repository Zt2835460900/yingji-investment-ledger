#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP_ROOT="/var/backups/yingji"
STATE_ROOT="/var/lib/yingji/state"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

case "$(readlink -f "$STATE_ROOT")" in
  /var/lib/yingji/state) ;;
  *) echo "Unexpected state path" >&2; exit 1 ;;
esac

install -d -m 0700 "$BACKUP_ROOT"
DB_FILE="$(find "$STATE_ROOT/v3/d1/miniflare-D1DatabaseObject" -maxdepth 1 -type f -name '*.sqlite' ! -name 'metadata.sqlite' -print -quit)"
if [[ -z "$DB_FILE" ]]; then
  echo "Investment database not found" >&2
  exit 1
fi

DB_BACKUP="$BACKUP_ROOT/yingji-$STAMP.sqlite"
JSON_BACKUP="$BACKUP_ROOT/yingji-$STAMP.json"
sqlite3 "$DB_FILE" ".timeout 10000" ".backup '$DB_BACKUP'"
curl --fail --silent --show-error --max-time 60 \
  http://127.0.0.1:8787/api/portfolio \
  --output "$JSON_BACKUP"

gzip -9 "$DB_BACKUP" "$JSON_BACKUP"
sha256sum "$DB_BACKUP.gz" "$JSON_BACKUP.gz" > "$BACKUP_ROOT/yingji-$STAMP.sha256"

find "$BACKUP_ROOT" -maxdepth 1 -type f -mtime +30 -delete
