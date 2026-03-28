# Contributing to read-pal

Thank you for your interest in contributing to read-pal! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

### Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

### Prerequisites

- Node.js 20+ and pnpm 8+
- Docker and Docker Compose (for local development)
- Git
- A code editor (VS Code recommended)

### Initial Setup

```bash
# Fork the repository
git clone https://github.com/your-username/read-pal.git
cd read-pal

# Install dependencies
pnpm install

# Start local services
docker-compose up -d

# Copy environment template
cp .env.example .env
# Edit .env with your configuration

# Build the project
pnpm build

# Start development
pnpm dev
```

### Recommended VS Code Extensions

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- GitLens
- Docker
- Thunder Client (for API testing)

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test additions/changes
- `chore/` - Maintenance tasks

### 2. Make Changes

Follow our coding standards (see below).

### 3. Test Your Changes

```bash
# Run tests
pnpm test

# Run linter
pnpm lint

# Type check
pnpm typecheck
```

### 4. Commit Changes

Follow our commit conventions (see below).

```bash
git add .
git commit -m "feat: add reading streak tracking"
```

### 5. Push and Create Pull Request

```bash
git push origin feature/your-feature-name
```

Then create a pull request on GitHub.

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict mode in tsconfig.json
- Avoid `any` types - use proper types or `unknown`
- Use interfaces for object shapes
- Use type aliases for unions/intersections

```typescript
// ✅ Good
interface User {
  id: string;
  name: string;
  email: string;
}

function getUser(id: string): Promise<User> {
  // ...
}

// ❌ Bad
function getUser(id: any): any {
  // ...
}
```

### Code Style

Follow the style defined in `.claude/rules/code-style.md`:

- Use 2-space indentation
- Use single quotes for strings
- Use trailing commas in multi-line structures
- Use early returns to reduce nesting
- Keep functions under 50 lines
- Limit files to 300 lines

```typescript
// ✅ Good
async function getData(id: string): Promise<Data | null> {
  if (!id) {
    return null;
  }

  const data = await db.find(id);
  return data ?? null;
}

// ❌ Bad
async function getData(id) {
  let result;
  if (id) {
    const data = await db.find(id);
    if (data) {
      result = data;
    } else {
      result = null;
    }
  } else {
    result = null;
  }
  return result;
}
```

### AI Agent Development

If you're working on AI agents, follow `.claude/rules/ai-agents.md`:

- Each agent has a single, clear purpose
- All external operations use tools
- Select appropriate models (Haiku/Sonnet/Opus)
- Handle errors gracefully
- Log all agent decisions
- Monitor costs

### Reading Friend Design

If you're working on the Reading Friend system, follow `.claude/rules/reading-friend.md`:

- Personalities are consistent and well-defined
- Conversations feel natural
- Respect user boundaries
- Know when to speak and when to be silent
- Handle emotional moments appropriately

### Error Handling

```typescript
// ✅ Good
async function processDocument(id: string) {
  try {
    const doc = await db.documents.find(id);
    if (!doc) {
      throw new NotFoundError(`Document ${id} not found`);
    }
    return await processor.process(doc);
  } catch (error) {
    logger.error('Failed to process document', { id, error });
    throw new ProcessingError('Could not process document', { cause: error });
  }
}

// ❌ Bad
async function processDocument(id) {
  const doc = await db.documents.find(id);
  return await processor.process(doc);
}
```

## Testing Guidelines

### Test Structure

```
packages/api/
├── src/
│   └── agents/
│       └── companion/
│           └── agent.ts
└── tests/
    ├── unit/
    │   └── agents/
    │       └── companion/
    │           └── agent.test.ts
    └── integration/
        └── agents/
            └── companion/
                └── workflow.test.ts
```

### Writing Tests

```typescript
describe('CompanionAgent', () => {
  describe('explain', () => {
    it('should explain concepts in context', async () => {
      const agent = new CompanionAgent(mockContext);
      const result = await agent.explain({
        term: 'entanglement',
        context: 'physics textbook'
      });

      expect(result.explanation).toBeDefined();
      expect(result.difficulty).toBe('appropriate');
    });

    it('should handle unknown terms gracefully', async () => {
      const agent = new CompanionAgent(mockContext);
      const result = await agent.explain({
        term: 'nonexistent term xyz123',
        context: 'any'
      });

      expect(result.suggestion).toContain('search');
    });
  });
});
```

### Coverage Requirements

| Package | Unit | Integration | Overall |
|---------|------|-------------|---------|
| `@read-pal/api` | 80% | 70% | 75% |
| `@read-pal/web` | 80% | 60% | 70% |
| `@read-pal/mobile` | 70% | 50% | 60% |
| `@read-pal/shared` | 90% | 70% | 80% |

### Running Tests

```bash
# All tests
pnpm test

# Specific package
pnpm test --filter=@read-pal/api

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage
```

## Commit Conventions

We use conventional commits with some additional rules.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `ci`: CI/CD changes

### Scopes

Common scopes:
- `api` - Backend API
- `web` - Web application
- `mobile` - Mobile application
- `agents` - AI agents
- `companion` - Companion agent
- `research` - Research agent
- `coach` - Coach agent
- `synthesis` - Synthesis agent
- `friend` - Reading friend system
- `db` - Database
- `auth` - Authentication
- `ui` - UI components

### Examples

```
feat(agents): add concept explanation tool

Implements a new tool for the Companion Agent that explains
concepts in context. Uses Haiku for simple terms and Sonnet
for complex concepts.

Closes #123
```

```
fix(companion): handle missing citations gracefully

Previously, the agent would fail when a book had no citations.
Now it provides a helpful message suggesting the user add
citations or search for related content.

Fixes #456
```

```
feat(friend): add Sage personality

Implements the Sage reading friend personality:
- Wise and patient tone
- Asks probing questions
- References past readings
- Celebrates intellectual breakthroughs

Closes #789
```

## Pull Request Process

### PR Title

Use conventional commit format:

```
feat(agents): add concept explanation tool
fix(companion): handle missing citations gracefully
docs(api): update authentication endpoints
```

### PR Description

Include:

```markdown
## Summary
Brief description of changes.

## Changes
- Bullet point for each major change
- Include issue numbers if applicable

## Testing
- How you tested
- Test coverage added

## Screenshots (if applicable)
Screenshots or recordings of changes

## Checklist
- [ ] Tests pass
- [ ] Coverage maintained
- [ ] Documentation updated
- [ ] No linting errors
- [ ] Commit messages follow conventions
```

### Review Process

1. Automated checks must pass (tests, lint, coverage)
2. At least one approval required
3. All review comments must be addressed
4. PR must be up-to-date with main branch

### Merging

- Squash and merge for most PRs
- Maintain commit history for large features
- Delete branch after merge

## Areas for Contribution

We welcome contributions in many areas:

### Frontend
- React/React Native components
- UI/UX improvements
- Accessibility enhancements
- Performance optimizations

### Backend
- API endpoints
- Database optimizations
- Authentication/authorization
- File processing

### AI Agents
- New agent capabilities
- Tool implementations
- Conversation improvements
- Cost optimization

### Testing
- Test coverage improvements
- New test scenarios
- Performance benchmarks
- E2E test scenarios

### Documentation
- API documentation
- User guides
- Developer guides
- Examples and tutorials

### Infrastructure
- CI/CD improvements
- Docker optimizations
- Monitoring and logging
- Security enhancements

## Getting Help

- GitHub Issues: Report bugs or request features
- Discussions: Ask questions or discuss ideas
- Discord: Join our community server (coming soon)
- Email: dev@readpal.com

## Recognition

Contributors will be:
- Listed in our contributors section
- Credited in release notes
- Invited to our contributor Discord channel
- Eligible for read-pal swag (after 5 merged PRs)

Thank you for contributing to read-pal! 🚀

---

**Last Updated:** March 28, 2026
