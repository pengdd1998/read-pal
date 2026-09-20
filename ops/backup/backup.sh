#!/usr/bin/env bash
# read-pal daily backup → OFF-SITE COS (GAP plan C2).
# Runs ON THE VPS via cron. Hard rule: nothing is retained on this host —
# the local staging dir is a transit area only (same-VPS retention would
# make the backup worthless; see ops/backup/README.md).
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/readpal-backup.env}"
[ -r "$ENV_FILE" ] && . "$ENV_FILE"
: "${COS_BUCKET:?set COS_BUCKET}" "${COS_REGION:?}" "${COS_ENDPOINT:?}" \
   "${COS_AK:?}" "${COS_SK:?}" "${BACKUP_DIR:=/var/lib/readpal-backup}" \
   "${PG_CONTAINER:=infra-postgres}" "${REDIS_CONTAINER:=infra-redis}"

STAMP="$(date -u +%F)"
WEEK="$(date -u +%G-W%V)"
STAGE="$BACKUP_DIR/$STAMP"
mkdir -p "$STAGE"

s3() {  # s3 <local> <key>  — upload via COS's S3-compatible endpoint
  docker run --rm -e AWS_ACCESS_KEY_ID="$COS_AK" -e AWS_SECRET_ACCESS_KEY="$COS_SK" \
    -v "$(dirname "$1"):/data:ro" --network host \
    amazon/aws-cli s3 cp "/data/$(basename "$1")" \
    "s3://$COS_BUCKET/$2" --endpoint-url "https://$COS_ENDPOINT"
}

echo "[$STAMP] pg_dump…"
docker exec "$PG_CONTAINER" pg_dump -U readpal -d readpal -Fc -f "/tmp/readpal.dump"
docker cp "$PG_CONTAINER:/tmp/readpal.dump" "$STAGE/readpal-$STAMP.dump"
docker exec "$PG_CONTAINER" rm -f /tmp/readpal.dump

echo "[$STAMP] redis RDB…"
docker exec "$REDIS_CONTAINER" redis-cli BGSAVE >/dev/null
sleep 3  # BGSAVE is async; drill asserts the file, here a short wait is enough
docker cp "$REDIS_CONTAINER:/data/dump.rdb" "$STAGE/redis-$STAMP.rdb" || \
  echo "WARN: redis RDB copy failed (redis data is rebuildable — continuing)"

echo "[$STAMP] upload daily…"
s3 "$STAGE/readpal-$STAMP.dump" "daily/$STAMP/readpal-$STAMP.dump"
[ -f "$STAGE/redis-$STAMP.rdb" ] && s3 "$STAGE/redis-$STAMP.rdb" "daily/$STAMP/redis-$STAMP.rdb"

if [ "$(date -u +%u)" = "7" ]; then  # Sunday → weekly copy (bucket lifecycle keeps 28d)
  echo "[$STAMP] weekly copy…"
  s3 "$STAGE/readpal-$STAMP.dump" "weekly/$WEEK/readpal-$STAMP.dump"
fi

rm -rf "$STAGE"   # transit only — retention lives on the off-site bucket
echo "[$STAMP] OK"
