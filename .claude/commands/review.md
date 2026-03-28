# Code Review Command

Run comprehensive code review for read-pal.

## Usage

```
/project:review [scope]
```

## Scope Options

- `all` (default) - Review all changes
- `agents` - Review AI agent code
- `api` - Review API code
- `web` - Review web application code
- `mobile` - Review mobile application code
- `security` - Security-focused review
- `performance` - Performance-focused review

## What It Reviews

### 1. Code Quality
- Clean, readable, maintainable code
- Follows code style guidelines (`.claude/rules/code-style.md`)
- Proper TypeScript usage
- Meaningful variable and function names
- Appropriate code organization

### 2. Bug Detection
- Logic errors and edge cases
- Null/undefined handling
- Race conditions
- Memory leaks
- Unreachable code

### 3. AI Agent Quality (if applicable)
- Follows AI agent rules (`.claude/rules/ai-agents.md`)
- Single purpose per agent
- Proper tool usage
- Appropriate model selection
- Error handling
- Cost optimization

### 4. Reading Friend Quality (if applicable)
- Follows reading friend rules (`.claude/rules/reading-friend.md`)
- Personality consistency
- Natural conversation flow
- Emotional appropriateness
- Boundary respect

### 5. Performance
- Unnecessary computations
- Inefficient algorithms
- Memory usage
- Database query optimization
- API response times

### 6. Security
- Input validation
- SQL/NoSQL injection
- XSS vulnerabilities
- Authentication/authorization
- Sensitive data handling
- API security

### 7. Testing
- Test coverage
- Test quality
- Missing test cases
- Test organization

### 8. Documentation
- Code comments
- API documentation
- Type definitions
- README updates (if needed)

## Review Process

1. **Analyze Changes** - Understand what changed and why
2. **Check Guidelines** - Verify against relevant rules
3. **Identify Issues** - Categorize and prioritize issues
4. **Provide Feedback** - Actionable recommendations
5. **Suggest Fixes** - Where appropriate, provide fix suggestions

## Output Format

```
## Code Review Results

### Summary
- Files changed: X
- Issues found: Y (Z critical, A major, B minor, C suggestions)
- Overall: [PASS/FAIL]

### Critical Issues (Must Fix)
...

### Major Issues (Should Fix)
...

### Minor Issues (Nice to Fix)
...

### Suggestions (Improvements)
...

### Positive Findings
...
```

## Priority Levels

- **Critical** - Security vulnerabilities, data loss risks
- **Major** - Bugs, performance issues, rule violations
- **Minor** - Style inconsistencies, small improvements
- **Suggestion** - Optional enhancements

## Example

```
/project:review agents

→ Reviews all AI agent code changes
  - Checks agent structure compliance
  - Verifies tool usage patterns
  - Validates prompt engineering
  - Reviews error handling
  - Analyzes cost optimization
```

---

**This command ensures code quality and consistency across read-pal.**
