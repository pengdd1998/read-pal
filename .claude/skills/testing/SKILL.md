# Testing Automation Skill

Auto-invoked for testing in read-pal.

## Trigger

This skill activates when:
1. You run `/project:test`
2. You create or modify test files
3. Code coverage drops below thresholds
4. You ask to test specific components

## What I Do

I help create, run, and analyze tests for read-pal, with special attention to AI agent testing.

## My Capabilities

### 1. Test Generation
I create tests for:
- Components (React, React Native)
- API endpoints
- AI agent capabilities
- Tool implementations
- Database operations
- Integration flows

### 2. Test Execution
I run and analyze:
- Unit tests
- Integration tests
- End-to-end tests
- Agent conversation tests
- Performance tests
- Coverage reports

### 3. Test Analysis
I provide insights on:
- Test coverage gaps
- Failing test patterns
- Performance issues
- Flaky test identification
- Test quality assessment

### 4. Test Improvement
I help improve tests by:
- Refactoring duplicate test code
- Adding missing test cases
- Improving test reliability
- Optimizing test performance
- Better test organization

## Test Categories

### Unit Tests
Test individual functions and components:

```typescript
describe('CompanionAgent.explain', () => {
  it('should explain concepts in context');
  it('should adapt explanation to user level');
  it('should handle unknown terms');
  it('should use appropriate model');
  it('should handle errors gracefully');
});
```

### Integration Tests
Test component interactions:

```typescript
describe('Agent Orchestration', () => {
  it('should coordinate multiple agents');
  it('should pass context between agents');
  it('should handle agent failures');
  it('should return synthesized results');
});
```

### Agent Conversation Tests
Test conversation quality:

```typescript
describe('Conversation Quality', () => {
  it('should sound natural and human-like');
  it('should maintain personality consistency');
  it('should be helpful and appropriate');
  it('should handle edge cases gracefully');
  it('should recover from errors');
});
```

### Performance Tests
Test agent performance:

```typescript
describe('Agent Performance', () => {
  it('should respond within 500ms for simple queries');
  it('should respond within 2s for complex queries');
  it('should handle 100 concurrent requests');
  it('should stay within $0.10 cost per 100 interactions');
});
```

## Coverage Requirements

| Package | Unit | Integration | Overall |
|---------|------|-------------|---------|
| `@read-pal/api` | 80% | 70% | 75% |
| `@read-pal/web` | 80% | 60% | 70% |
| `@read-pal/mobile` | 70% | 50% | 60% |
| `@read-pal/shared` | 90% | 70% | 80% |

## AI Agent Testing Guidelines

### 1. Test Agent Capabilities
```typescript
describe('CompanionAgent', () => {
  describe('explain', () => {
    it('should provide context-aware explanations', async () => {
      const result = await agent.explain({
        term: 'entanglement',
        context: 'quantum physics textbook'
      });

      expect(result.explanation).toBeDefined();
      expect(result.difficulty).toBe('appropriate');
      expect(result.modelUsed).toBe('claude-3-5-sonnet');
    });

    it('should use simpler model for common terms', async () => {
      const result = await agent.explain({
        term: 'apple',
        context: 'children\'s book'
      });

      expect(result.modelUsed).toBe('claude-3-5-haiku');
      expect(result.cost).toBeLessThan(0.001);
    });
  });
});
```

### 2. Test Tool Usage
```typescript
describe('Tool Usage', () => {
  it('should use library_search tool', async () => {
    const agent = new CompanionAgent(mockContext);

    await agent.chat('What have I read about AI?');

    expect(mockContext.tools.library_search).toHaveBeenCalledWith({
      query: 'AI',
      userId: 'test-user'
    });
  });

  it('should handle tool failures gracefully', async () => {
    const agent = new CompanionAgent({
      tools: {
        library_search: jest.fn().mockRejectedValue(new Error('DB down'))
      }
    });

    const result = await agent.chat('What have I read about AI?');

    expect(result.error).toBeDefined();
    expect(result.fallback).toBeDefined();
  });
});
```

### 3. Test Conversation Quality
```typescript
describe('Conversation Quality', () => {
  it('should maintain personality', async () => {
    const responses = await Promise.all([
      agent.chat('Hello'),
      agent.chat('How are you?'),
      agent.chat('Tell me a joke')
    ]);

    responses.forEach(r => {
      expect(r.tone).toBe('sage'); // Consistent personality
    });
  });

  it('should be appropriate for context', async () => {
    const sadResult = await agent.chat('This is depressing');
    const happyResult = await agent.chat('This is wonderful!');

    expect(sadResult.emotionalTone).toBe('empathetic');
    expect(happyResult.emotionalTone).toBe('celebratory');
  });
});
```

## Test Output Analysis

### Success
```
✅ All tests passed!

Package: @read-pal/api
Tests: 847 passed, 0 failed
Duration: 2m 34s
Coverage: 78.3% (target: 75%)

Unit Tests: ████████████████████ 823 passed
Integration Tests: ████████████ 24 passed

Performance: ✓ All within SLA
Cost: ✓ $0.08 per 100 interactions (target: $0.10)
```

### Failure Analysis
```
❌ Some tests failed

Failed Tests:
1. CompanionAgent › explain › should handle unknown terms
   → Expected suggestion to search, got apology
   → Line: companion/agent.ts:145

2. CoachAgent › detectConfusion › should identify backtrack pattern
   → Threshold too low, missed 30% of cases
   → Line: coach/agent.ts:89

3. Integration › agentHandoff › should pass full context
   → Missing readingLocation in context
   → Line: orchestrator/handoff.ts:34

Suggestions:
1. Add fallback suggestion for unknown terms
2. Increase backtrack threshold to 0.3
3. Include readingLocation in handoff context

Apply fixes? [Y/n]
```

## Flaky Test Detection

I detect and flag flaky tests:
```
⚠️ Flaky Test Detected

Test: CompanionAgent › explain › concurrent requests
Behavior: Passes 70% of the time
Issue: Race condition in tool caching
Fix: Add request queuing or debouncing

Location: companion/agent.ts:234
```

## Performance Benchmarking

I track and report performance:

```typescript
interface PerformanceMetrics {
  responseTime: {
    p50: number;  // 200ms
    p95: number;  // 450ms
    p99: number;  // 800ms
  };
  throughput: number;     // requests per second
  errorRate: number;      // percentage
  costPer100: number;     // dollars
  memoryUsage: number;    // MB
}

// Targets
const targets = {
  responseTime: { p50: 300, p95: 500, p99: 1000 },
  throughput: 100,
  errorRate: 0.01,
  costPer100: 0.10
};
```

## Test Organization

```
packages/
├── api/
│   ├── tests/
│   │   ├── unit/
│   │   │   ├── agents/
│   │   │   │   ├── companion/
│   │   │   │   │   ├── agent.test.ts
│   │   │   │   │   ├── explain.test.ts
│   │   │   │   │   └── tools.test.ts
│   │   │   │   ├── research/
│   │   │   │   ├── coach/
│   │   │   │   └── synthesis/
│   │   │   ├── tools/
│   │   │   └── services/
│   │   ├── integration/
│   │   │   ├── agents/
│   │   │   │   ├── orchestration.test.ts
│   │   │   │   └── handoff.test.ts
│   │   │   └── api/
│   │   └── e2e/
│   │       └── user-flows/
│   └── src/
├── web/
│   └── ...
└── shared/
    └── ...
```

## Commands

### Run All Tests
```bash
pnpm test
```

### Run Specific Package
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

### Run Specific Test
```bash
pnpm test companion.agent.test
```

---

**I ensure read-pal remains reliable through comprehensive testing.**
