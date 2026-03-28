# Deployment Command

Deploy read-pal to staging or production.

## Usage

```
/project:deploy [environment]
```

## Environment Options

- `staging` (default) - Deploy to staging environment
- `production` - Deploy to production environment
- `dry-run` - Simulate deployment without executing

## What It Does

1. **Pre-deployment Checks** - Verify everything is ready
2. **Build** - Build all packages for production
3. **Test** - Run test suite
4. **Deploy** - Deploy to target environment
5. **Verify** - Run smoke tests on deployed version
6. **Monitor** - Check deployment health

## Pre-deployment Checklist

### Code Quality
- [ ] All tests pass
- [ ] Coverage thresholds met
- [ ] No linting errors
- [ ] Security review passed (if applicable)

### Environment
- [ ] Environment variables configured
- [ ] Secrets are up-to-date
- [ ] Database migrations prepared
- [ ] Feature flags configured

### Dependencies
- [ ] No vulnerable dependencies
- [ ] License compliance verified
- [ ] Third-party services available

### Documentation
- [ ] CHANGELOG updated
- [ ] API docs updated (if applicable)
- [ ] Migration notes prepared (if needed)

## Deployment Process

### 1. Pre-deployment Verification
```bash
# Run tests
pnpm test

# Check coverage
pnpm test:coverage

# Lint code
pnpm lint

# Security audit
pnpm audit
```

### 2. Build for Production
```bash
# Build all packages
pnpm build

# Verify build outputs
ls -la packages/api/dist
ls -la packages/web/.next
ls -la packages/mobile/dist
```

### 3. Environment Setup
```bash
# Set environment
export DEPLOY_ENV=staging

# Load environment variables
source .env.${DEPLOY_ENV}

# Verify required variables
./scripts/verify-env.sh
```

### 4. Database Migrations
```bash
# Run pending migrations
pnpm --filter @read-pal/api db:migrate up

# Verify migration status
pnpm --filter @read-pal/api db:migrate status
```

### 5. Deploy Services

#### API Deployment
```bash
# Deploy API to AWS ECS
./scripts/deploy-api.sh ${DEPLOY_ENV}

# Or for staging:
pnpm --filter @read-pal/api deploy:staging
```

#### Web Deployment
```bash
# Deploy web to Vercel/Netlify
pnpm --filter @read-pal/web deploy:${DEPLOY_ENV}
```

#### Mobile Deployment
```bash
# Build and submit to App Store/Play Store
pnpm --filter @read-pal/mobile deploy:${DEPLOY_ENV}
```

### 6. Smoke Tests
```bash
# Run smoke tests on deployed environment
./scripts/smoke-tests.sh ${DEPLOY_ENV}
```

Tests include:
- Health check endpoints
- Authentication flow
- Basic agent interaction
- Database connectivity
- Third-party service connectivity

### 7. Monitor Deployment
```bash
# Check application logs
./scripts/tail-logs.sh ${DEPLOY_ENV}

# Monitor metrics
./scripts/check-metrics.sh ${DEPLOY_ENV}

# Verify alerts are working
./scripts/test-alerts.sh ${DEPLOY_ENV}
```

## Deployment Environments

### Staging
- **URL:** `https://staging.readpal.com`
- **Purpose:** Pre-production testing
- **Data:** Staging database (sanitized copy of production)
- **Features:** All features enabled
- **Monitoring:** Full monitoring enabled

### Production
- **URL:** `https://readpal.com`
- **Purpose:** Live production
- **Data:** Production database
- **Features:** Feature-flagged features
- **Monitoring:** Full monitoring + alerts

## Rollback Plan

If deployment fails:

```bash
# Immediate rollback
./scripts/rollback.sh ${DEPLOY_ENV}

# Verify rollback
./scripts/smoke-tests.sh ${DEPLOY_ENV}

# Monitor for issues
./scripts/tail-logs.sh ${DEPLOY_ENV}
```

Rollback triggers:
- Smoke test failures
- Critical errors in logs
- Performance degradation (>50% increase in response time)
- Error rate spike (>5% increase)

## Post-deployment

### Immediate (0-15 minutes)
- Monitor error rates
- Check response times
- Verify critical functions work
- Monitor database performance

### Short-term (15-60 minutes)
- Monitor user feedback
- Check analytics for anomalies
- Verify third-party integrations
- Review logs for issues

### Long-term (1-24 hours)
- Monitor cost metrics (especially AI agent usage)
- Review user feedback channels
- Check for memory leaks or performance degradation
- Verify backup systems working

## Deployment Report

```markdown
## Deployment Report

### Summary
- **Environment:** staging
- **Version:** 1.2.3
- **Status:** ✅ Success
- **Duration:** 12 minutes

### Changes
- feat(companion): Add concept explanation tool
- fix(api): Handle missing citations gracefully
- docs: Update API documentation

### Test Results
- Unit tests: ✅ 847 passed
- Integration tests: ✅ 24 passed
- E2E tests: ✅ 12 passed
- Smoke tests: ✅ All passed
- Coverage: 78.3%

### Deployment Details
- API: Deployed to ECS (task: read-pal-api-1.2.3)
- Web: Deployed to Vercel (commit: abc123)
- Database: Migrations applied (2 migrations)
- Features: Reading friend enabled

### Verification
- Health check: ✅ https://staging.readpal.com/health
- Auth flow: ✅ Working
- Agents: ✅ All responding
- Database: ✅ Connected and optimized
- Third-party: ✅ All services connected

### Monitoring
- Error rate: 0.1% (normal)
- Response time: p95: 450ms (normal)
- AI agent cost: $0.08/100 interactions (normal)
- Active users: 142 (normal)

### Rollback
- Rollback available: Yes
- Rollback command: `./scripts/rollback.sh staging`
- Previous version: 1.2.2

### Next Steps
- Monitor for 24 hours
- Review user feedback
- Check cost metrics tomorrow
- Plan next deployment
```

## Emergency Procedures

### If Deployment Fails Mid-process
```bash
# Stop deployment
./scripts/deploy-stop.sh ${DEPLOY_ENV}

# Check current state
./scripts/deploy-status.sh ${DEPLOY_ENV}

# Decide: rollback or fix
```

### If Critical Issues Found Post-deployment
```bash
# Immediate rollback
./scripts/rollback.sh ${DEPLOY_ENV}

# Notify team
./scripts/notify-oncall.sh "Critical issue detected, rolled back"

# Create incident
./scripts/create-incident.sh ${DEPLOY_ENV}
```

## Cost Monitoring

AI agent costs require special attention:

```bash
# Check agent costs
./scripts/check-agent-costs.sh ${DEPLOY_ENV}

# Alert if costs exceed threshold
if cost > threshold; then
  ./scripts/notify-cost-alert.sh ${DEPLOY_ENV} ${cost}
fi
```

Cost thresholds:
- Haiku usage: Should be >60% of requests
- Sonnet usage: ~35% of requests
- Opus usage: <5% of requests
- Cost per 100 interactions: <$0.10

## Example

```bash
/project:deploy staging

→ Runs through full deployment process:
  - Pre-deployment checks
  - Build all packages
  - Run test suite
  - Deploy to staging
  - Run smoke tests
  - Monitor deployment health
  - Generate deployment report
```

---

**This command ensures safe, reliable deployments.**
