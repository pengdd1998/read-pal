# Testing Command

Run comprehensive tests for read-pal.

## Usage

```
/project:test [scope]
```

## Scope Options

- `all` (default) - Run entire test suite
- `unit` - Run unit tests only
- `integration` - Run integration tests only
- `e2e` - Run end-to-end tests only
- `agents` - Run AI agent tests only
- `@package-name` - Run tests for specific package

## What It Does

1. **Runs Tests** - Executes the specified test scope
2. **Generates Coverage** - Creates coverage reports
3. **Checks Thresholds** - Verifies coverage meets requirements
4. **Reports Results** - Summarizes test results
5. **Suggests Fixes** - Provides suggestions for failing tests

## Coverage Requirements

| Package | Unit | Integration | Overall |
|---------|------|-------------|---------|
| `@read-pal/api` | 80% | 70% | 75% |
| `@read-pal/web` | 80% | 60% | 70% |
| `@read-pal/mobile` | 70% | 50% | 60% |
| `@read-pal/shared` | 90% | 70% | 80% |

## Test Organization

```
packages/
├── api/
│   ├── tests/
│   │   ├── unit/           # Unit tests
│   │   ├── integration/    # Integration tests
│   │   └── e2e/           # End-to-end tests
│   └── src/
│       ├── agents/        # Agent-specific tests
│       │   ├── companion.test.ts
│       │   ├── research.test.ts
│       │   ├── coach.test.ts
│       │   └── synthesis.test.ts
│       └── ...
├── web/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   └── ...
└── ...
```

## AI Agent Testing

Special considerations for testing AI agents:

### Unit Tests
Test individual agent capabilities:
```typescript
describe('CompanionAgent', () => {
  it('should explain concepts in context');
  it('should generate summaries');
  it('should handle unknown terms gracefully');
  it('should respect user preferences');
});
```

### Integration Tests
Test agent workflows:
```typescript
describe('CompanionAgent Integration', () => {
  it('should use tools to search library');
  it('should coordinate with Research Agent');
  it('should handle tool failures gracefully');
});
```

### Conversation Tests
Test conversation quality:
```typescript
describe('Conversation Quality', () => {
  it('should sound natural');
  it('should maintain personality');
  it('should be helpful and appropriate');
  it('should handle edge cases');
});
```

### Performance Tests
Test agent performance:
```typescript
describe('Agent Performance', () => {
  it('should respond within SLA');
  it('should stay within cost budgets');
  it('should handle concurrent requests');
});
```

## Running Tests

### All Tests
```bash
pnpm test
```

### Specific Package
```bash
pnpm test --filter=@read-pal/api
```

### Watch Mode
```bash
pnpm test:watch
```

### Coverage Report
```bash
pnpm test:coverage
```

## CI/CD Integration

Tests run automatically on:
- Every pull request
- Every merge to main
- Before deployment

## Test Results

### Success Output
```
✅ All tests passed!

Test Suite: 847 tests
Duration: 2m 34s
Coverage: 78.3%

Unit Tests: ████████████████████ 823 passed
Integration Tests: ████████████ 24 passed

No failures!
```

### Failure Output
```
❌ Some tests failed

Test Suite: 847 tests
Failures: 3

Failed Tests:
1. CompanionAgent › should explain complex concepts
   → Expected simpler language for haiku model

2. CoachAgent › should detect confusion
   → Backtrack rate threshold too low

3. Integration › agent handoff
   → Context not passed correctly

Suggestions:
1. Adjust language complexity in system prompt
2. Increase backtrack threshold to 0.3
3. Fix context passing in orchestrator

Run: pnpm test --fix to apply suggestions
```

---

**Testing ensures read-pal remains reliable and delightful.**
