# read-pal Restore Runbook

How to restore the read-pal PostgreSQL database from a `docker/backup.sh`
archive, and how to verify the result. Read this **before** you need it.

## Context

- There is **no `postgres` service in `docker-compose.yml`** — the database is
  external infrastructure on the VPS (`DB_HOST` in `.env`).
- The `api` container image is `python:3.12-slim` and does **not** contain
  `pg_dump` / `psql`. All dump/restore commands run from the **host** with
  `postgresql-client` installed.
- Archives live in `./backups/` on the VPS, named `readpal_YYYYMMDD_HHMMSS.sql.gz`
  (custom-format-free plain SQL, gzipped, `--no-owner --no-privileges`).

## 0. Prerequisites (one-time, on the VPS)

```bash
sudo apt-get install -y postgresql-client   # provides pg_dump and psql
cd /home/ubuntu/projects/read-pal
source .env                                  # exports DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD
```

## 1. Take a safety dump BEFORE restoring

Never restore over a live database without a fresh snapshot of its current
state — even a broken one may hold data the archive does not.

```bash
cd /home/ubuntu/projects/read-pal
source .env
PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges | gzip > "backups/pre_restore_$(date +%Y%m%d_%H%M%S).sql.gz"
```

## 2. Stop writers

The API writes continuously (sessions, heartbeats, chat). Stop it before
restoring so it cannot interleave writes into the restore.

```bash
docker compose stop api web
```

(Leave `nginx` running if you want to serve a maintenance page; it will return
502s, which is correct during a restore.)

## 3. Restore

### Option A — restore into the existing database (drop + recreate schema)

```bash
cd /home/ubuntu/projects/read-pal
source .env

gunzip -c backups/readpal_<TIMESTAMP>.sql.gz \
  | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --set ON_ERROR_STOP=on -v verbosity=verbose
```

`ON_ERROR_STOP=on` makes psql abort on the first error instead of ploughing on
and producing a silently half-restored database.

### Option B — restore into a fresh database (cleanest for catastrophic loss)

```bash
cd /home/ubuntu/projects/read-pal
source .env

psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS ${DB_NAME}_restored;"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE ${DB_NAME}_restored;"

gunzip -c backups/readpal_<TIMESTAMP>.sql.gz \
  | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" \
    -d "${DB_NAME}_restored" --set ON_ERROR_STOP=on

# Verify against the scratch DB first (step 4), then swap:
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "ALTER DATABASE ${DB_NAME} RENAME TO ${DB_NAME}_old;"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
  -c "ALTER DATABASE ${DB_NAME}_restored RENAME TO ${DB_NAME};"
```

## 4. Verify the restore

Run all of these — an archive that restores without errors can still be wrong.

```bash
cd /home/ubuntu/projects/read-pal
source .env

# a) Row counts for the core tables (compare against expectations / old DB)
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
  SELECT 'users' t, count(*) FROM users
  UNION ALL SELECT 'books', count(*) FROM books
  UNION ALL SELECT 'annotations', count(*) FROM annotations
  UNION ALL SELECT 'chat_messages', count(*) FROM chat_messages;"

# b) Schema is at the expected migration revision
docker compose run --rm api python -m alembic current

# c) Application-level health check
docker compose up -d api web
sleep 15
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8090/api/v1/health   # expect 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8090/en              # expect 200
```

Expected: (a) counts match the pre-incident state; (b) alembic reports the head
revision the archive was taken at (if it is behind, run
`docker compose run --rm api python -m alembic upgrade head`); (c) both
endpoints return 200.

## 5. Resume

```bash
docker compose up -d
```

## 6. Backups schedule (NOT currently wired)

`docker/backup.sh` is **not** installed in cron on the server. To enable it,
add the following crontab entry (`crontab -e`) — daily at 03:17 server time:

```cron
17 3 * * * /home/ubuntu/projects/read-pal/docker/backup.sh >> /home/ubuntu/projects/read-pal/backups/backup.log 2>&1
```

Verify afterwards with `crontab -l`, and confirm a first archive appears in
`backups/` after the scheduled time. `backup.sh` fails loudly (non-zero exit,
message on stderr) if `pg_dump` is missing or a dump comes back empty — a
failed run is visible in `backup.log` rather than silently leaving no backup.

## Caveats

- Archives are plain SQL: restoring replays every `INSERT`/`CREATE` in order.
  A partial archive (truncated gzip) will fail loudly thanks to
  `ON_ERROR_STOP=on`; do not ignore the error.
- `--no-owner --no-privileges` means roles/grants are not restored; the
  `readpal` role must already exist on the target server (it does in our setup).
- Backups older than 7 days are deleted by `backup.sh`. If you need longer
  retention, copy archives off-box before the 7-day window closes.
