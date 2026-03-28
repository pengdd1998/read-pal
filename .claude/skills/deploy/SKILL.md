---
name: deploy
description: Deployment workflow triggered before releasing to production
trigger: When changes are pushed to main/release branch
---

# Deploy Skill

## Pre-deployment Checks
1. All tests pass
2. No linting errors
3. Build succeeds
4. Security scan clean
5. Changelog updated

## Deployment Steps
1. Build production artifacts
2. Run database migrations (if any)
3. Deploy to staging environment
4. Run smoke tests on staging
5. Promote to production
6. Verify production health

## Rollback
If deployment fails:
1. Check error logs
2. Revert to previous known-good version
3. Investigate root cause
4. Fix and re-deploy
