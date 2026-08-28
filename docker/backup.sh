#!/usr/bin/env bash
# Daily PostgreSQL backup with 7-day retention.
# Usage: ./docker/backup.sh
# Designed to run via cron on the deploy server.
#
# NOTE: there is NO `postgres` service in docker-compose.yml — the database is
# external infrastructure on the VPS. The api container image is
# python:3.12-slim and does NOT ship pg_dump, so backups run from the HOST
# using a locally installed postgresql-client (pg_dump). See docker/RESTORE.md
# for restore instructions and the recommended crontab entry.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
RETENTION_DAYS=7

# Source .env for DB credentials
if [ -f "${PROJECT_DIR}/.env" ]; then
    # shellcheck disable=SC1091
    source "${PROJECT_DIR}/.env"
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-readpal}"
DB_USER="${DB_USER:-readpal}"
DB_PASSWORD="${DB_PASSWORD:-}"

# ---------------------------------------------------------------------------
# Preflight: pg_dump must exist on the host. Fail loudly — a silent fallback
# or a skipped backup is worse than a failed cron job.
# ---------------------------------------------------------------------------
if ! command -v pg_dump &>/dev/null; then
    echo "ERROR: pg_dump not found on host." >&2
    echo "The postgres service no longer exists in docker-compose.yml and the" >&2
    echo "api image (python:3.12-slim) does not contain pg_dump." >&2
    echo "Install the PostgreSQL client tools on the VPS, e.g.:" >&2
    echo "  sudo apt-get install -y postgresql-client" >&2
    echo "Then re-run: $0" >&2
    exit 1
fi

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Dump the external database from the host (write to temp file, verify, rename)
TMP_FILE="${BACKUP_FILE}.partial"
PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
    --no-owner --no-privileges \
    | gzip > "${TMP_FILE}"

# A truncated/empty dump is a corrupt backup — refuse to keep it.
if [ ! -s "${TMP_FILE}" ]; then
    rm -f "${TMP_FILE}"
    echo "ERROR: pg_dump produced an empty archive for ${DB_NAME}. Backup aborted." >&2
    exit 1
fi
mv "${TMP_FILE}" "${BACKUP_FILE}"

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[${TIMESTAMP}] Backup created: ${BACKUP_FILE} (${SIZE})"

# Delete backups older than retention period
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[${TIMESTAMP}] Cleaned backups older than ${RETENTION_DAYS} days"
