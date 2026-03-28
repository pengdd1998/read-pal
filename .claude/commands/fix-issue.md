# Issue Fix Command

Fix a specific issue in read-pal.

## Usage

```
/project:fix-issue <issue-description>
```

## What It Does

Guides you through fixing an issue:

1. **Understand** - Analyze the issue description
2. **Locate** - Find the relevant code files
3. **Diagnose** - Identify the root cause
4. **Fix** - Implement the solution
5. **Test** - Verify the fix works
6. **Document** - Update tests and documentation

## Issue Types

### Bug Reports
```
/project:fix-issue Companion agent crashes when user provides empty input

→ Analyzes the crash
→ Finds the missing validation
→ Adds proper error handling
→ Adds test for edge case
→ Verifies fix
```

### Performance Issues
```
/project:fix-issue Library search takes >10 seconds for large libraries

→ Profiles the slow operation
→ Identifies bottleneck (missing index?)
→ Implements optimization
→ Benchmarks improvement
→ Adds performance test
```

### AI Agent Issues
```
/project:fix-issue Sage personality using exclamation marks

→ Reviews personality configuration
→ Finds incorrect speech pattern
→ Fixes tone inconsistency
→ Tests conversation outputs
→ Verifies personality consistency
```

### Feature Gaps
```
/project:fix-issue Cannot export memory books as PDF

→ Checks export functionality
→ Identifies missing PDF generator
→ Implements PDF export
→ Tests export quality
→ Updates documentation
```

## Process

### 1. Understand the Issue
```markdown
## Issue Analysis
**Description:** [What's broken?]
**Impact:** [Who/what does this affect?]
**Priority:** [Critical/Major/Minor]
**Reproduction:** [How to reproduce]
```

### 2. Locate the Code
```markdown
## Code Location
**Files involved:**
- `packages/api/src/agents/companion/agent.ts`
- `packages/api/src/tools/explain.ts`

**Related components:**
- Companion Agent
- Explain Tool
```

### 3. Diagnose the Root Cause
```markdown
## Root Cause
**Problem:** [What's actually wrong?]
**Why it happens:** [Technical explanation]
**Edge cases:** [Related scenarios]
```

### 4. Implement the Fix
```markdown
## Solution
**Approach:** [How we're fixing it]
**Changes:**
- File: agent.ts, Line: 145
- Added: Input validation
- Changed: Error handling
```

### 5. Test the Fix
```markdown
## Testing
**Tests added:**
- companion/agent.test.ts:45 - test empty input
- companion/agent.test.ts:52 - test null input

**Manual testing:**
- Verified with empty input
- Verified with null input
- Verified with valid input (no regression)

**Coverage:** Increased from 78% to 82%
```

### 6. Report
```markdown
## Fix Summary

### What Was Wrong
The Companion Agent's `explain` method crashed when receiving
empty or null input because it didn't validate the input
before passing it to the Claude API.

### What Changed
- Added input validation in agent.ts:145
- Added graceful error message for invalid input
- Added unit tests for edge cases

### Why This Fix Works
The validation catches invalid input before it reaches the API,
providing a helpful error message instead of crashing. The tests
ensure this edge case is covered going forward.

### Verification
- All tests pass ✅
- Manual testing completed ✅
- No regression detected ✅
```

## Common Issue Patterns

### Null/Undefined Errors
```typescript
// ❌ Before - Crashes on null
function processUser(user: User) {
  return user.name.toUpperCase();
}

// ✅ After - Handles null
function processUser(user: User | null) {
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return user.name.toUpperCase();
}
```

### Race Conditions
```typescript
// ❌ Before - Race condition
async function updateCount(id: string) {
  const item = await db.get(id);
  item.count++;
  await db.save(id, item);
}

// ✅ After - Atomic operation
async function updateCount(id: string) {
  await db.increment(id, { count: 1 });
}
```

### Memory Leaks
```typescript
// ❌ Before - Memory leak
class Agent {
  listeners = [];
  subscribe(fn) {
    this.listeners.push(fn);
  }
}

// ✅ After - Cleanup mechanism
class Agent {
  listeners = new Map();
  subscribe(fn) {
    const id = Symbol();
    this.listeners.set(id, fn);
    return () => this.listeners.delete(id);
  }
}
```

### AI Agent Issues
```typescript
// ❌ Before - No error handling
async function explain(term: string) {
  return await claude.messages.create({
    model: 'claude-3-5-sonnet',
    messages: [{ role: 'user', content: `Explain ${term}` }]
  });
}

// ✅ After - With error handling and fallback
async function explain(term: string) {
  if (!term?.trim()) {
    return {
      error: 'Please provide a term to explain',
      suggestion: 'Try searching your library instead'
    };
  }

  try {
    const response = await claude.messages.create({...});
    return { explanation: response.content[0].text };
  } catch (error) {
    logger.error('Explanation failed', { term, error });
    return {
      error: 'Could not explain term',
      suggestion: 'Try again later or search your library'
    };
  }
}
```

## Example Output

```
## Issue Fix Complete ✅

### Issue
Companion agent crashes when user provides empty input

### Root Cause
Missing input validation in the `explain` method caused the
Claude API to receive empty requests, resulting in 400 errors.

### Solution Implemented
1. Added input validation check
2. Return helpful error message
3. Added unit tests for edge cases

### Files Changed
- packages/api/src/agents/companion/agent.ts (added validation)
- packages/api/tests/agents/companion/agent.test.ts (added tests)

### Test Results
✅ All tests pass (847 passed)
✅ Coverage: 78% → 82%
✅ No regressions detected

### Ready to Commit
```

---

**This command ensures systematic, well-tested issue resolution.**
