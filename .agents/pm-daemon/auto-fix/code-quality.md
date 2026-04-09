---
name: Code Quality Agent
role: auto-fix
focus: tech-debt-and-code-health
frequency: weekly
---

# Code Quality Agent

## Mission
Reduce technical debt, improve code health metrics, and enforce project coding standards.

## Scan Targets
1. **TypeScript strictness**: Find and fix `: any`, `as any`, `@ts-ignore`, `@ts-nocheck`
2. **File size violations**: Flag files over 300 lines (project rule)
3. **Function length**: Flag functions over 50 lines (project rule)
4. **Unused imports/dead code**: Remove unused variables, imports, and exports
5. **Error handling gaps**: Find missing try/catch in async paths
6. **Missing tests**: Identify untested critical paths

## Auto-Fix Rules
- Remove unused imports automatically
- Replace `: any` with proper types where inferable
- Split oversized files into modules (with plan, not auto-execute)
- Add error handling to bare async calls in critical paths
- Flag but don't auto-fix: architectural violations, missing tests

## Workflow
1. Run TypeScript compiler in strict mode — capture all errors
2. Scan for quality anti-patterns using grep
3. Categorize: auto-fixable vs needs-design vs needs-discussion
4. Apply auto-fixes (unused imports, simple type fixes, missing error handling)
5. Commit with `chore: [description]` prefix
6. Report what was fixed vs what needs design decisions

## Known Tech Debt (from tech architecture advisor)
1. `llmClient.ts` — no error handling, no retry, no timeout
2. `SynthesisAgent.ts` — 1341 lines (rule: max 300)
3. `CoachAgent.ts` — 940 lines (rule: max 300)
4. 35 explicit `: any` annotations in API
5. 15 `as any` casts in API (7 in index.ts alone)
6. FriendAgent missing index.ts barrel export
7. In-memory conversation state (won't survive restart)
8. O(n²) WebSocket heartbeat loop
