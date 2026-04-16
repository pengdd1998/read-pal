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
   ssh -i $SSH_KEY_PATH $DEPLOY_USER@$DEPLOY_SERVER "cd $DEPLOY_PATH && git pull origin main"
   ```
4. **Build API** and restart:
   ```bash
   ssh -i $SSH_KEY_PATH $DEPLOY_USER@$DEPLOY_SERVER "cd $DEPLOY_PATH/packages/api && pnpm build && pm2 restart read-pal-api"
   ```
5. **Build Web** and restart:
   ```bash
   ssh -i $SSH_KEY_PATH $DEPLOY_USER@$DEPLOY_SERVER "cd $DEPLOY_PATH/packages/web && NEXT_PUBLIC_API_URL= pnpm build && pm2 restart read-pal-web"
   ```
6. **Verify** both services are responding:
   ```bash
   curl -s -o /dev/null -w '%{http_code}' http://$DEPLOY_SERVER:3001/api/books  # expect 401
   curl -s -o /dev/null -w '%{http_code}' http://$DEPLOY_SERVER:3000             # expect 200
   ```

## Key Info

- **Server**: Set `DEPLOY_SERVER`, `DEPLOY_USER`, `SSH_KEY_PATH` in your environment
- **API**: PM2 process `read-pal-api`, port 3001, cwd must be absolute `$DEPLOY_PATH/packages/api`
- **Web**: PM2 process `read-pal-web`, port 3000, build with `NEXT_PUBLIC_API_URL=` (empty)
- **DB**: PostgreSQL via `DB_*` environment variables
- **Redis**: Via `REDIS_URL` environment variable

## Troubleshooting

- If SSH fails: try with sandbox disabled (sandbox blocks network)
- If PM2 cwd resolves wrong: use absolute paths, never relative
- If web build fails on fonts: retry with sandbox disabled
- If DB migration needed: use node script with explicit DB_* env vars (not DATABASE_URL)
