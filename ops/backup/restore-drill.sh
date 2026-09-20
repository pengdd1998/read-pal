#!/usr/bin/env bash
# Monthly off-site restore drill (GAP plan C2) — must run the FULL chain:
# download from COS → restore into a scratch DB → assert data integrity.
# A backup that was never restored from does not exist. Exits non-zero on
# any red step; record the run in execution-record.csv.
set -euo pipefail

ENV_FILE="${BACKUP_ENV_FILE:-/etc/readpal-backup.env}"
[ -r "$ENV_FILE" ] && . "$ENV_FILE"
: "${COS_BUCKET:?}" "${COS_REGION:?}" "${COS_ENDPOINT:?}" "${COS_AK:?}" "${COS_SK:?}" \
   "${BACKUP_DIR:=/var/lib/readpal-backup}" "${PG_CONTAINER:=infra-postgres}"
DRILL_DB=readpal_drill
STAGE="$BACKUP_DIR/drill-$(date -u +%FT%H%M)"
mkdir -p "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

echo "== 1. off-site retrieval (weekly/ latest) =="
LATEST_KEY=$(docker run --rm -e AWS_ACCESS_KEY_ID="$COS_AK" -e AWS_SECRET_ACCESS_KEY="$COS_SK" \
  --network host amazon/aws-cli s3 ls "s3://$COS_BUCKET/weekly/" --recursive \
  --endpoint-url "https://$COS_ENDPOINT" | awk '{print $4}' | sort | tail -1)
[ -n "$LATEST_KEY" ] || { echo "FAIL: no weekly backup found off-site"; exit 1; }
echo "retrieving: $LATEST_KEY"
docker run --rm -e AWS_ACCESS_KEY_ID="$COS_AK" -e AWS_SECRET_ACCESS_KEY="$COS_SK" \
  -v "$STAGE:/data" --network host amazon/aws-cli s3 cp \
  "s3://$COS_BUCKET/$LATEST_KEY" /data/ --endpoint-url "https://$COS_ENDPOINT"
DUMP="$STAGE/$(basename "$LATEST_KEY")"
[ -s "$DUMP" ] || { echo "FAIL: retrieved dump empty"; exit 1; }

echo "== 2. restore into scratch db =="
docker cp "$DUMP" "$PG_CONTAINER:/tmp/drill.dump"
docker exec "$PG_CONTAINER" psql -U readpal -d postgres -c "DROP DATABASE IF EXISTS $DRILL_DB;"
docker exec "$PG_CONTAINER" psql -U readpal -d postgres -c "CREATE DATABASE $DRILL_DB;"
docker exec "$PG_CONTAINER" pg_restore -U readpal -d "$DRILL_DB" --no-owner /tmp/drill.dump
docker exec "$PG_CONTAINER" rm -f /tmp/drill.dump

echo "== 3. assertions =="
q() { docker exec "$PG_CONTAINER" psql -U readpal -d "$DRILL_DB" -tAc "$1"; }
USERS=$(q "SELECT count(*) FROM users")
BOOKS=$(q "SELECT count(*) FROM books")
VER=$(q "SELECT version_num FROM alembic_version")
[ "$USERS" -gt 0 ] || { echo "FAIL: users=0"; exit 1; }
[ "$BOOKS" -gt 0 ] || { echo "FAIL: books=0"; exit 1; }
echo "users=$USERS books=$BOOKS alembic=$VER"

docker exec "$PG_CONTAINER" psql -U readpal -d postgres -c "DROP DATABASE $DRILL_DB;"
echo "DRILL PASS — record to execution-record.csv"
