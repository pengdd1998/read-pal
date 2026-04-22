#!/usr/bin/env bash
# Daily PostgreSQL backup with 7-day retention.
# Usage: ./docker/backup.sh
# Designed to run via cron on the deploy server.

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

mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

# Run pg_dump inside the postgres container (if docker compose is available)
if command -v docker &>/dev/null; then
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T postgres \
        pg_dump -U "${DB_USER}" -d "${DB_NAME}" \
        | gzip > "${BACKUP_FILE}"
else
    PGPASSWORD="${DB_PASSWORD}" pg_dump \
        -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
        | gzip > "${BACKUP_FILE}"
fi

SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[${TIMESTAMP}] Backup created: ${BACKUP_FILE} (${SIZE})"

# Delete backups older than retention period
find "${BACKUP_DIR}" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[${TIMESTAMP}] Cleaned backups older than ${RETENTION_DAYS} days"
