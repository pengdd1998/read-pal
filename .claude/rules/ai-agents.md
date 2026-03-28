# AI Agent Development Rules

## Overview

This document defines the rules and guidelines for developing AI agents within read-pal. All agent development must follow these principles to ensure consistency, reliability, and a great user experience.

## Core Principles

### 1. Single Purpose
Each agent must have one clear, well-defined purpose.

```
✅ Good: The Companion Agent helps readers understand text in context.
❌ Bad: The Companion Agent helps with understanding, research, and coaching.
```

### 2. Tool-Based Architecture
Agents must use tools for all external operations. Never hard-code functionality.

```typescript
// ✅ Good - Uses tool
const result = await agent.useTool('library_search', {
  query: userQuery,
  filters: { userId }
});

// ❌ Bad - Hard-coded database call
const result = await db.library.find({ userId, query });
```

### 3. Model Selection
Use the appropriate Claude model for the task:

| Model | Use Case | Examples |
|-------|----------|----------|
| **Haiku 3.5** | Simple, fast tasks | Status checks, basic queries, classifications |
| **Sonnet 4.6** | Most interactions | Explanations, conversations, standard assistance |
| **Opus 4.6** | Complex reasoning | Synthesis, deep analysis, multi-document comparison |

### 4. Error Handling
All agents must handle errors gracefully and provide fallback behavior.

```typescript
try {
  const result = await tool.call();
  return result;
} catch (error) {
  // Log error for debugging
  logger.error('Tool call failed', { error, tool, context });

  // Provide user-friendly fallback
  return {
    error: 'I encountered an issue. Let me try a different approach.',
    fallback: await fallbackMethod()
  };
}
```

### 5. Cost Awareness
Monitor and optimize API costs per user interaction.

```typescript
// Track costs
const costTracker = {
  haiku: 0.00025 / 1k tokens,  // ~$0.25 per million tokens
  sonnet: 0.003 / 1k tokens,   // ~$3 per million tokens
  opus: 0.015 / 1k tokens      // ~$15 per million tokens
};

// Target: < $0.10 per user per month
// Implement caching, batching, and smart model selection
```

## Agent Structure

### Required Components

Every agent must have:

```typescript
interface AgentDefinition {
  // Identity
  name: string;              // e.g., "companion-agent"
  displayName: string;       // e.g., "Reading Companion"
  version: string;           // e.g., "1.0.0"

  // Purpose
  purpose: string;           // One-sentence purpose
  responsibilities: string[];// Key responsibilities

  // AI Configuration
  model: ModelConfig;        // Which model to use
  systemPrompt: string;      // System prompt
  temperature?: number;      // Creativity (0-1)
  maxTokens?: number;        // Response length limit

  // Tools
  tools: ToolDefinition[];   // Available tools

  // Memory
  memoryType: 'none' | 'session' | 'persistent';

  // Behavior
  interventionStyle: 'reactive' | 'proactive' | 'hybrid';
  interruptThreshold?: number; // 0-1, when to interrupt reading

  // Constraints
  constraints: string[];     // What the agent must NOT do
}
```

### System Prompt Template

```typescript
const systemPrompt = `
You are {{displayName}}, an AI agent for read-pal.

## Your Purpose
{{purpose}}

## Your Responsibilities
{{responsibilities}}

## How You Work
1. Always consider the user's current context
2. Use available tools to accomplish tasks
3. Be concise and helpful
4. Admit when you don't know something
5. Ask for clarification when needed

## Your Personality
{{personality}}

## Constraints
{{constraints}}

## Available Tools
{{tools}}

Remember: You are an AI assistant, not human. Be helpful but
never pretend to be something you're not.
`;
```

## Tool Development

### Tool Definition Structure

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  category: 'database' | 'ai' | 'external' | 'memory';

  // Input schema (JSON Schema)
  input_schema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };

  // Handler
  handler: (input: any, context: AgentContext) => Promise<ToolResult>;

  // Configuration
  timeout?: number;          // Max execution time (ms)
  retryable?: boolean;       // Can this be retried on failure?
  cacheable?: boolean;       // Can results be cached?
}
```

### Tool Categories

#### Database Tools
Access read-pal databases (PostgreSQL, Neo4j, Pinecone).

```typescript
// Example: library_search
{
  name: 'library_search',
  description: 'Search across user\'s reading library',
  category: 'database',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      userId: { type: 'string', description: 'User ID' },
      filters: {
        type: 'object',
        description: 'Optional filters (date, tag, etc.)'
      }
    },
    required: ['query', 'userId']
  },
  handler: async (input, ctx) => {
    // Implementation
  }
}
```

#### AI Tools
Use other AI capabilities (e.g., different model, special processing).

```typescript
// Example: generate_summary
{
  name: 'generate_summary',
  description: 'Generate a summary of the given text',
  category: 'ai',
  input_schema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to summarize' },
      detail: {
        type: 'string',
        enum: ['brief', 'medium', 'detailed'],
        description: 'Level of detail'
      }
    },
    required: ['text']
  },
  handler: async (input, ctx) => {
    // Use appropriate model based on text length
    const model = input.text.length > 10000 ? 'opus' : 'sonnet';
    return await ctx.ai.generateSummary(input.text, input.detail, model);
  }
}
```

#### External Tools
Interact with external APIs (web search, content fetching, etc.).

```typescript
// Example: web_search
{
  name: 'web_search',
  description: 'Search the web for current information',
  category: 'external',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      numResults: {
        type: 'number',
        description: 'Number of results (1-10)',
        default: 5
      }
    },
    required: ['query']
  },
  handler: async (input, ctx) => {
    return await ctx.webSearch.search(input.query, input.numResults);
  }
}
```

#### Memory Tools
Access and update agent memory.

```typescript
// Example: store_memory
{
  name: 'store_memory',
  description: 'Store information in agent memory',
  category: 'memory',
  input_schema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Memory key' },
      value: { type: 'string', description: 'Value to store' },
      category: {
        type: 'string',
        enum: ['user_preference', 'reading_context', 'conversation_history'],
        description: 'Memory category'
      }
    },
    required: ['key', 'value', 'category']
  },
  handler: async (input, ctx) => {
    return await ctx.memory.store(input.key, input.value, input.category);
  }
}
```

## Agent Orchestration

### Multi-Agent Coordination

When multiple agents need to work together:

```typescript
class AgentOrchestrator {
  async coordinate(request: UserRequest): Promise<Response> {
    // 1. Analyze request to determine which agents are needed
    const agents = this.selectAgents(request);

    // 2. Execute agents in parallel if independent
    const results = await Promise.all(
      agents.map(agent => agent.execute(request))
    );

    // 3. Synthesize results
    return await this.synthesizerAgent.combine(results);
  }
}
```

### Agent Handoff

When one agent needs to hand off to another:

```typescript
// From Companion to Research
if (userRequest.requiresExternalInfo) {
  const handoff = {
    from: 'companion',
    to: 'research',
    context: {
      originalQuery: userRequest.text,
      readingLocation: currentLocation,
      userUnderstandingLevel: currentLevel
    }
  };

  return await researchAgent.receive(handoff);
}
```

## Testing Requirements

### Unit Tests
Every agent must have unit tests covering:

```typescript
describe('CompanionAgent', () => {
  it('should explain concepts in context', async () => {
    const result = await agent.explain({
      text: 'quantum entanglement',
      context: 'physics textbook'
    });

    expect(result.explanation).toBeDefined();
    expect(result.difficulty).toBe('appropriate');
  });

  it('should handle unknown terms gracefully', async () => {
    const result = await agent.explain({
      text: 'gibberish term xyz123',
      context: 'any'
    });

    expect(result.suggestion).toContain('search');
  });
});
```

### Integration Tests
Test agent workflows with actual tools:

```typescript
describe('CompanionAgent Integration', () => {
  it('should search library when user asks for related content', async () => {
    const response = await agent.chat(
      'What else have I read about cognitive biases?'
    );

    expect(response.toolsUsed).toContain('library_search');
    expect(response.content).toMatch(/Here's what you've read/);
  });
});
```

### Performance Tests
Monitor agent performance:

```typescript
describe('Agent Performance', () => {
  it('should respond within 500ms for simple queries', async () => {
    const start = Date.now();
    await agent.chat('summarize this paragraph');
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it('should stay within cost budgets', async () => {
    const cost = await agent.executeComplexTask();

    expect(cost.total).toBeLessThan(0.10); // $0.10 max
  });
});
```

## Logging and Monitoring

### Required Logging

Every agent must log:

```typescript
interface AgentLogEntry {
  timestamp: Date;
  agent: string;
  action: string;
  input?: any;
  output?: any;
  toolsUsed?: string[];
  modelUsed?: string;
  tokensUsed?: number;
  cost?: number;
  duration: number;
  error?: Error;
}
```

### Metrics to Track

- Response times (p50, p95, p99)
- Tool usage frequency
- Model usage (Haiku vs Sonnet vs Opus)
- Token consumption
- Cost per user
- Error rates

## Security Considerations

### Input Validation
Always validate and sanitize inputs:

```typescript
function validateAgentInput(input: any, schema: any): void {
  // Validate against schema
  const validated = validateSchema(input, schema);

  // Sanitize to prevent injection
  const sanitized = sanitizeInput(validated);

  // Check size limits
  if (JSON.stringify(sanitized).length > MAX_INPUT_SIZE) {
    throw new Error('Input too large');
  }
}
```

### Output Sanitization
Sanitize agent outputs before showing to users:

```typescript
function sanitizeOutput(output: string): string {
  // Remove any potential XSS
  let sanitized = output.replace(/<script[^>]*>.*?<\/script>/gi, '');

  // Escape HTML
  sanitized = escapeHtml(sanitized);

  return sanitized;
}
```

### Permission Checks
Agents must respect user permissions:

```typescript
async function checkToolAccess(
  userId: string,
  toolName: string
): Promise<boolean> {
  const permissions = await getUserPermissions(userId);

  return permissions.allowedTools.includes(toolName);
}
```

## Deployment

### Versioning
Use semantic versioning for agents:

```
MAJOR.MINOR.PATCH

MAJOR: Breaking changes to agent behavior
MINOR: New features, backward compatible
PATCH: Bug fixes, improvements
```

### Environment Configuration
Support multiple environments:

```typescript
const config = {
  development: {
    model: 'sonnet',
    temperature: 0.7,
    verboseLogging: true
  },
  staging: {
    model: 'sonnet',
    temperature: 0.7,
    verboseLogging: false
  },
  production: {
    model: 'sonnet',
    temperature: 0.7,
    verboseLogging: false
  }
};
```

### Rollback Strategy
Always maintain ability to rollback:

```typescript
// Store previous agent version
const previousVersion = await loadAgentVersion('companion', '0.9.0');

// If new version fails
if (errorRate > 0.05) {
  await rollbackTo('companion', '0.9.0');
}
```

## Checklist

Before deploying an agent:

- [ ] Single, clear purpose defined
- [ ] All operations use tools
- [ ] Appropriate model selected
- [ ] Error handling implemented
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Performance benchmarks met
- [ ] Cost analysis acceptable
- [ ] Logging configured
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Rollback plan ready

---

**All agent development must follow these rules to ensure read-pol provides a reliable, delightful experience.**
