---
name: deploy
description: Deploy read-pal to production server via SSH + PM2
trigger: Manual — run /deploy when ready to ship
---

# Deploy Read-Pal

Deploy the latest code to the production server and verify.

## Steps

1. **Stage and commit** any uncommitted changes
2. **Push** to origin/main
3. **SSH to server** and pull latest:
   ```bash
   ssh -i ~/.ssh/REDACTED_KEY ubuntu@REDACTED_IP "cd REDACTED_DEPLOY_PATH && git pull origin main"
   ```
4. **Build API** and restart:
   ```bash
   ssh -i ~/.ssh/REDACTED_KEY ubuntu@REDACTED_IP "cd REDACTED_DEPLOY_PATH/packages/api && pnpm build && pm2 restart read-pal-api"
   ```
5. **Build Web** and restart:
   ```bash
   ssh -i ~/.ssh/REDACTED_KEY ubuntu@REDACTED_IP "cd REDACTED_DEPLOY_PATH/packages/web && NEXT_PUBLIC_API_URL= pnpm build && pm2 restart read-pal-web"
   ```
6. **Verify** both services are responding:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://REDACTED_IP:3001/api/books  # expect 401
   curl -s -o /dev/null -w '%{http_code}' http://REDACTED_IP:3000             # expect 200
   ```

## Key Info

- **Server**: REDACTED_IP, user `ubuntu`, SSH key `~/.ssh/REDACTED_KEY`
- **API**: PM2 process `read-pal-api`, port 3001, cwd must be absolute `REDACTED_DEPLOY_PATH/packages/api`
- **Web**: PM2 process `read-pal-web`, port 3000, build with `NEXT_PUBLIC_API_URL=` (empty)
- **DB**: PostgreSQL `readpal` @ localhost:5432, user `readpal`, password `REDACTED_PASSWORD`
- **Redis**: `redis://:REDACTED_PASSWORD@localhost:6379`

## Troubleshooting

- If SSH fails: try with sandbox disabled (sandbox blocks network)
- If PM2 cwd resolves wrong: use absolute paths, never relative
- If web build fails on fonts: retry with sandbox disabled
- If DB migration needed: use node script with explicit DB_* env vars (not DATABASE_URL)
