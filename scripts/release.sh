#!/bin/bash
set -e

# Release automation script for read-pal
# Builds, deploys, and verifies in one shot

DEPLOY_DIR="/home/ubuntu/read-pal"
SSH_KEY="$HOME/.ssh/local_ubuntu_key"
SERVER="ubuntu@192.168.1.13"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Release starting..."

# Step 1: Check for local changes to ship
LOCAL_CHANGES=$(git status --porcelain | head -20)
if [ -n "$LOCAL_CHANGES" ]; then
  echo "[WARN] Uncommitted changes found. Ship what we have."
fi

# Step 2: Check commits ahead of origin
AHEAD=$(git log --oneline origin/main..HEAD 2>/dev/null | wc -l)
if [ "$AHEAD" -gt 0 ]; then
  echo "[DEPLOY] Pushing $AHEAD commits to origin..."
  git push origin main
else
  echo "[INFO] No unpushed commits."
fi

# Step 3: SSH to server and deploy
echo "[DEPLOY] Deploying to production..."
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$SERVER" bash -s <<'REMOTE'
set -e
cd /home/ubuntu/read-pal

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pulling latest code..."
BEFORE=$(git rev-parse HEAD)
git fetch origin main
git reset --hard origin/main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "[INFO] Code already up to date at $AFTER. Rebuilding anyway..."
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Building API..."
cd packages/api && pnpm build 2>&1 | tail -2

echo "[$(date '+%Y-%d %H:%M:%S')] Building Web..."
cd ../web && export NEXT_PUBLIC_API_URL= && pnpm build 2>&1 | tail -5

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting services..."
pm2 delete all 2>/dev/null || true
sleep 1
pm2 start /home/ubuntu/read-pal/packages/api/dist/index.js --name read-pal-api --cwd /home/ubuntu/read-pal/packages/api
sleep 2
pm2 start node --name read-pal-web --cwd /home/ubuntu/read-pal/packages/web -- .next/standalone/server.js
pm2 save
sleep 5

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Health check..."
API_HEALTH=$(curl -s http://localhost:3001/health)
WEB_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000)

if echo "$API_HEALTH" | grep -q '"ok"'; then
  echo "[OK] API healthy: $API_HEALTH"
else
  echo "[FAIL] API unhealthy: $API_HEALTH"
  exit 1
fi

if [ "$WEB_STATUS" = "200" ]; then
  echo "[OK] Web healthy: HTTP $WEB_STATUS"
else
  echo "[FAIL] Web unhealthy: HTTP $WEB_STATUS"
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy complete at $AFTER"
REMOTE

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Release finished."
