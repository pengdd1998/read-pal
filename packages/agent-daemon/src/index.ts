/**
 * read-pal Agent Daemon — GLM-powered autonomous development agent
 *
 * Runs scheduled tasks (security scans, bug fixes, sim users, etc.)
 * using GLM (Zhipu AI) as the LLM engine with function-calling tool use.
 *
 * Usage: GLM_API_KEY=... npm start
 */

import 'dotenv/config';
import { Scheduler, type ScheduledTask } from './scheduler.js';
import { runAgentLoop } from './agent.js';

const PROJECT_ROOT = process.env.PROJECT_ROOT || 'REDACTED_LOCAL_PATH';

// ============================================================================
// Task Definitions
// ============================================================================

const TASKS: ScheduledTask[] = [
  // --- Daily Operations ---
  {
    name: 'morning-health-check',
    cron: '17 9 * * *',
    prompt: `You are the read-pal PM Daemon. Run a quick project health check:
1. Run "git log --oneline -5" to see recent commits
2. Run "curl -s http://REDACTED_IP:3001/health" to check API health (or localhost:3001 if local)
3. Check if there are any uncommitted changes with "git status --short"
4. Summarize the project status in 2-3 sentences
Do NOT make any changes. Report only.`,
    maxTurns: 10,
    maxBudgetUsd: 0.10,
  },
  {
    name: 'security-scan',
    cron: '3 9 * * 1-5',
    prompt: `You are the read-pal Security Agent. Perform a quick security scan:
1. Check packages/api/src/middleware/auth.ts for hardcoded secrets
2. Check that JWT_SECRET is required (no fallback)
3. Verify rate limiting on auth routes
4. Check for any dangerouslySetInnerHTML without DOMPurify in packages/web
5. Report findings. Only fix CRITICAL issues (hardcoded secrets, open auth).
Do NOT make changes unless you find P0 issues.`,
    maxTurns: 20,
    maxBudgetUsd: 0.20,
  },
  {
    name: 'bug-fixes',
    cron: '33 9 * * 1-5',
    prompt: `You are the read-pal Bug Fixer. Check for and fix bugs:
1. Run "cd ${PROJECT_ROOT}/packages/api && npx tsc --noEmit 2>&1 | head -30" to check for TS errors
2. Run "cd ${PROJECT_ROOT}/packages/web && npx tsc --noEmit 2>&1 | head -30" to check for TS errors
3. If there are real errors (not warnings), fix them
4. Check git status for uncommitted changes that should be committed
5. If you make fixes, commit them with a descriptive message
Focus on real errors only. Do not add features or refactor.`,
    maxTurns: 30,
    maxBudgetUsd: 0.30,
  },
  {
    name: 'evening-deploy',
    cron: '0 18 * * 1-5',
    prompt: `You are the read-pal Deploy Agent. Execute the evening release:
1. Run "git status --short" to check for uncommitted work
2. If there are uncommitted changes, commit them with appropriate messages
3. Run "git push origin main" to push
4. SSH to REDACTED_IP and deploy: pull, build API, build web, restart PM2
   Use key: ssh -i ~/.ssh/REDACTED_KEY ubuntu@REDACTED_IP
5. Verify health with curl http://REDACTED_IP:3001/health
Report the deployment status.`,
    maxTurns: 25,
    maxBudgetUsd: 0.25,
  },

  // --- Simulation Users ---
  {
    name: 'sim-jamie',
    cron: '17 10 * * 1,3',
    prompt: `You are Jamie — a 22-year-old college student visiting read-pal for the very first time. You found it through a friend's recommendation.

Simulate a realistic user session by reviewing the actual codebase:
1. Read the landing page code in packages/web/src/app/page.tsx
2. Read the signup/login flow in packages/web/src/app/login/
3. Read the reading interface in packages/web/src/app/read/
4. Read the chat interface in packages/web/src/components/CompanionChat.tsx
5. Evaluate: How many steps to get to the first "wow" moment?
6. Is the onboarding clear? What would confuse Jamie?
7. Score the experience 1-10 and list the top 3 issues to fix
Do NOT make code changes. Just report findings.`,
    maxTurns: 15,
    maxBudgetUsd: 0.15,
  },
  {
    name: 'sim-sara',
    cron: '17 10 * * 2,4',
    prompt: `You are Sara — a 28-year-old marketing professional who reads 2-3 fiction books per month. She's tech-savvy but not a developer.

Simulate Sara's experience by reviewing the actual codebase:
1. Read the library page: packages/web/src/app/library/page.tsx
2. Read the reading page: packages/web/src/app/read/[id]/page.tsx
3. Read the AI chat component: packages/web/src/components/CompanionChat.tsx
4. Read the settings and friend pages
5. Evaluate: Is the reading page comfortable for long sessions?
6. Are highlights and notes intuitive?
7. Is the AI companion helpful or annoying?
8. Score the experience 1-10 and list the top 3 improvements
Do NOT make code changes. Just report findings.`,
    maxTurns: 15,
    maxBudgetUsd: 0.15,
  },

  // --- Weekly Tasks ---
  {
    name: 'weekly-brainstorm',
    cron: '3 14 * * 1',
    prompt: `You are the read-pal PM running the weekly team brainstorm.

Review the project and propose 3 concrete feature ideas:
1. Read CLAUDE.md for the project vision
2. Check the current state of the codebase — what's built, what's missing
3. Look at the most recent git commits for context
4. Propose 3 features that would have the highest impact on user experience
5. For each feature: what files to change, estimated complexity, and why it matters

Format as a prioritized list. Be specific about implementation.`,
    maxTurns: 20,
    maxBudgetUsd: 0.20,
  },
  {
    name: 'weekly-promotion',
    cron: '37 10 * * 5',
    prompt: `You are the read-pal promotion team lead.

Review what was accomplished this week:
1. Run "git log --oneline --since='7 days ago'" to see recent work
2. Summarize the week's progress in 3-4 bullet points
3. Suggest 2-3 social media post ideas to promote the new features
Keep the summary concise and marketing-friendly.`,
    maxTurns: 10,
    maxBudgetUsd: 0.10,
  },
];

// ============================================================================
// Agent Execution
// ============================================================================

async function runTask(task: ScheduledTask): Promise<void> {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[daemon] Starting task: "${task.name}"`);
  console.log(`[daemon] Budget: $${task.maxBudgetUsd.toFixed(2)}, Max turns: ${task.maxTurns}`);
  console.log(`${'='.repeat(60)}\n`);

  const result = await runAgentLoop({
    prompt: task.prompt,
    maxTurns: task.maxTurns,
    maxBudgetUsd: task.maxBudgetUsd,
    systemSuffix: `\nProject root: ${PROJECT_ROOT}\nCurrent date: ${new Date().toISOString().split('T')[0]}`,
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const costEstimate = (
    result.totalInputTokens * 0.0000001 +
    result.totalOutputTokens * 0.0000001
  ).toFixed(4);

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[daemon] Task "${task.name}" ${result.success ? 'completed' : 'failed'}`);
  console.log(`[daemon] Turns: ${result.turns}, Tokens: ${result.totalInputTokens}+${result.totalOutputTokens}`);
  console.log(`[daemon] Tools used: ${result.toolsUsed.join(', ') || 'none'}`);
  console.log(`[daemon] Cost: ~$${costEstimate}, Duration: ${duration}s`);
  if (result.error) {
    console.log(`[daemon] Error: ${result.error}`);
  }
  console.log(`[daemon] Output:\n${result.output.slice(0, 1000)}`);
  console.log(`${'─'.repeat(60)}\n`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   read-pal Agent Daemon v1.0.0 (GLM)     ║');
  console.log('╚══════════════════════════════════════════╝\n');

  if (!process.env.GLM_API_KEY) {
    console.error('ERROR: GLM_API_KEY is required');
    console.error('Create a .env file with: GLM_API_KEY=your-key');
    process.exit(1);
  }

  console.log(`Project root: ${PROJECT_ROOT}`);
  console.log(`GLM model: ${process.env.GLM_MODEL || 'glm-4.7-flash'}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  const scheduler = new Scheduler();

  for (const task of TASKS) {
    scheduler.addTask(task);
  }

  scheduler.start(async (task) => {
    await runTask(task);
  });

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\n[daemon] Shutting down...');
    scheduler.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    scheduler.stop();
    process.exit(0);
  });

  console.log('[daemon] Running. Press Ctrl+C to stop.\n');
}

main().catch(console.error);
