# Agent Development Skill

Auto-invoked when developing AI agents for read-pal.

## Trigger

This skill activates when:
1. You ask to create or modify an AI agent
2. Code imports `@anthropic-ai/sdk` or `claude-agent-sdk`
3. You're working in `/packages/api/src/agents/`
4. You ask about agent behavior, prompts, or tools

## What I Do

I help you build, test, and optimize AI agents following read-pal's agent development rules.

## My Capabilities

### 1. Agent Creation
I can create new agents with:
- Clear purpose and responsibilities
- Appropriate model selection (Haiku/Sonnet/Opus)
- System prompt with personality
- Tool definitions with schemas
- Error handling patterns
- Logging and monitoring

### 2. Agent Improvement
I can help improve existing agents by:
- Analyzing performance issues
- Optimizing model selection for cost
- Improving prompt effectiveness
- Adding new tools or capabilities
- Enhancing error handling
- Tuning personality parameters

### 3. Agent Testing
I can create tests for agents:
- Unit tests for individual capabilities
- Integration tests for tool usage
- Conversation quality tests
- Performance benchmarks
- Cost analysis tests

### 4. Agent Debugging
I can help debug agent issues:
- Analyze conversation logs
- Identify prompt problems
- Detect tool usage issues
- Find performance bottlenecks
- Suggest fixes based on patterns

## Process

When invoked, I follow this process:

### 1. Understand Requirements
```
- What should this agent do?
- Who will use it?
- What tools does it need?
- How does it coordinate with other agents?
```

### 2. Design Agent
```
- Define purpose and scope
- Select appropriate model
- Design tool interfaces
- Create system prompt
- Define personality (if applicable)
```

### 3. Implement
```
- Create agent file structure
- Implement tool handlers
- Add error handling
- Include logging
- Write tests
```

### 4. Validate
```
- Run unit tests
- Run integration tests
- Check performance benchmarks
- Verify cost budgets
- Test conversations
```

## Output Format

For new agents, I provide:

```typescript
// Agent definition
interface AgentDefinition {
  name: string;
  displayName: string;
  version: string;
  purpose: string;
  responsibilities: string[];
  model: ModelConfig;
  systemPrompt: string;
  tools: ToolDefinition[];
  memoryType: MemoryType;
  interventionStyle: InterventionStyle;
}

// System prompt
const systemPrompt = `...`;

// Tool definitions
const tools = [
  {
    name: 'tool_name',
    description: '...',
    input_schema: {...},
    handler: async (input, ctx) => {...}
  }
];

// Tests
describe('AgentName', () => {
  // ...
});
```

## Best Practices I Follow

1. **Single Purpose** - Each agent has one clear job
2. **Tool-Based** - All external operations use tools
3. **Model Selection** - Use Haiku for simple, Sonnet for most, Opus for complex
4. **Error Handling** - Graceful degradation with fallbacks
5. **Cost Awareness** - Monitor and optimize token usage
6. **Logging** - Comprehensive logging for debugging
7. **Testing** - Unit, integration, and conversation tests
8. **Documentation** - Clear documentation for maintenance

## Context

I have access to:
- `.claude/rules/ai-agents.md` - Agent development rules
- `.claude/agents/ai-agent-builder.md` - Agent builder persona
- `docs/product-plan.md` - Product specifications
- Agent implementation examples

---

**I'm here to help you build excellent AI agents for read-pal.**
