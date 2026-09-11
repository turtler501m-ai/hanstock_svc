#!/usr/bin/env bash
set -euo pipefail

TIME_SPEC="${1:-*/5 9-15 * * 1-5}"
CRON_TZ_VALUE="${HANSTOCK_CRON_TZ:-Asia/Seoul}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
JOB="$TIME_SPEC cd $ROOT_DIR && bash $ROOT_DIR/scripts/vm/strategy-dispatch.sh >> $ROOT_DIR/logs/strategy-dispatch.log 2>&1"
BEGIN_MARKER="# hanstock-svc-strategy-dispatch begin"
END_MARKER="# hanstock-svc-strategy-dispatch end"

existing="$(mktemp)"
filtered="$(mktemp)"
trap 'rm -f "$existing" "$filtered"' EXIT
crontab -l 2>/dev/null > "$existing" || true
awk -v begin="$BEGIN_MARKER" -v end="$END_MARKER" '
    $0 == begin { skip = 1; next }
    $0 == end { skip = 0; next }
    skip != 1 { print }
' "$existing" > "$filtered"
{
    cat "$filtered"
    echo "$BEGIN_MARKER"
    echo "CRON_TZ=$CRON_TZ_VALUE"
    echo "$JOB"
    echo "$END_MARKER"
} | crontab -

echo "[cron] installed isolated strategy dispatcher: $JOB"
