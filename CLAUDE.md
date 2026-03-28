# read-pal

## Project Overview

read-pal is an AI agent-based reading companion application that transforms passive reading into an active, social, and memorable learning journey. Unlike traditional reading tools, read-pal uses intelligent AI agents that learn with you, build knowledge over time, and become your reading friend.

## Vision

**The First True AI Reading Companion**

read-pal isn't just a tool—it's a friend who reads with you. Through intelligent AI agents, persistent memory, and emotional design, we transform reading from a solitary activity into a shared experience that deepens understanding and creates lasting knowledge.

## Core Innovations

1. **Multi-Agent Architecture** - Four specialized AI agents (Companion, Research, Coach, Synthesis)
2. **Reading Friend System** - AI personalities that build relationships over time
3. **Personal Knowledge Graph** - Auto-constructed knowledge networks across all readings
4. **Conversation with Books** - Bidirectional dialogue with content
5. **Memory Books** - Beautiful compilations of your reading journeys

## Tech Stack

### Primary Technologies
- **AI Engine:** Claude Agent SDK (Sonnet 4.6/4.5 for real-time, Opus 4.6 for complex analysis)
- **Frontend:**
  - Mobile: React Native (iOS/Android)
  - Web: Next.js + TypeScript + TailwindCSS
- **Backend:**
  - API: Node.js + Express + TypeScript
  - AI Orchestrator: Custom multi-agent system
- **Data Storage:**
  - Vector DB: Pinecone/Weaviate (semantic search)
  - Graph DB: Neo4j (knowledge graphs)
  - Relational DB: PostgreSQL (user data, library)
  - Cache: Redis (sessions, real-time)
- **Infrastructure:** AWS (ECS, Lambda, RDS, ElastiCache)

### Secondary Services
- **Authentication:** Auth0 / Clerk
- **File Storage:** S3 + CloudFront
- **Analytics:** Mixpanel / PostHog
- **Monitoring:** Sentry + Datadog
- **Search:** Algolia (library search)

## Project Structure

```
read-pal/
├── CLAUDE.md                    # This file - project instructions
├── CLAUDE.local.md              # Personal overrides (gitignored)
├── README.md                    # Public project README
├── docs/                        # Comprehensive documentation
│   ├── executive-summary.md     # Quick overview
│   ├── product-plan.md          # Full product specifications
│   ├── expert-meeting-summary.md # Expert consultation findings
│   ├── reading-friend-feature.md # Reading friend deep dive
│   ├── architecture.md          # Technical architecture
│   ├── api.md                   # API documentation
│   └── contributing.md          # Contribution guidelines
│
├── .claude/                     # Claude Code configuration
│   ├── settings.json            # Permissions config
│   ├── settings.local.json      # Personal permissions (gitignored)
│   ├── commands/                # Custom slash commands
│   │   ├── review.md            # Code review command
│   │   ├── fix-issue.md         # Issue fixing command
│   │   ├── deploy.md            # Deployment command
│   │   ├── feature.md           # Feature development command
│   │   └── test.md              # Testing command
│   ├── rules/                   # Modular instruction files
│   │   ├── code-style.md        # Code style guidelines
│   │   ├── testing.md           # Testing rules
│   │   ├── api-conventions.md   # API design rules
│   │   ├── ai-agents.md         # AI agent development rules
│   │   ├── reading-friend.md    # Reading friend design rules
│   │   └── security.md          # Security guidelines
│   ├── skills/                  # Auto-invoked workflows
│   │   ├── security-review/     # Security review skill
│   │   ├── deploy/              # Deployment skill
│   │   ├── agent-development/   # Agent development skill
│   │   └── testing/             # Testing automation skill
│   └── agents/                  # Subagent personas
│       ├── code-reviewer.md     # Code review agent
│       ├── security-auditor.md  # Security audit agent
│       ├── ai-agent-builder.md  # AI agent development specialist
│       └── reading-friend-designer.md # Reading friend UX specialist
│
├── packages/                    # Monorepo structure
│   ├── mobile/                  # React Native app
│   │   ├── src/
│   │   │   ├── components/      # UI components
│   │   │   ├── screens/         # Screen components
│   │   │   ├── navigation/      # Navigation config
│   │   │   ├── agents/          # AI agent integrations
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── utils/           # Utilities
│   │   │   └── types/           # TypeScript types
│   │   ├── ios/                 # iOS native code
│   │   ├── android/             # Android native code
│   │   └── package.json
│   │
│   ├── web/                     # Next.js web app
│   │   ├── src/
│   │   │   ├── app/             # App router pages
│   │   │   ├── components/      # React components
│   │   │   ├── lib/             # Utilities and configurations
│   │   │   ├── agents/          # AI agent integrations
│   │   │   └── styles/          # Global styles
│   │   ├── public/              # Static assets
│   │   └── package.json
│   │
│   ├── extension/               # Browser extension
│   │   ├── src/
│   │   │   ├── popup/           # Extension popup
│   │   │   ├── content/         # Content scripts
│   │   │   ├── background/      # Background service worker
│   │   │   └── agents/          # Agent integrations
│   │   └── package.json
│   │
│   ├── api/                     # Backend API
│   │   ├── src/
│   │   │   ├── routes/          # API routes
│   │   │   ├── services/        # Business logic
│   │   │   ├── models/          # Data models
│   │   │   ├── agents/          # AI agent system
│   │   │   │   ├── orchestrator/ # Multi-agent orchestrator
│   │   │   │   ├── companion/   # Reading companion agent
│   │   │   │   ├── research/    # Research agent
│   │   │   │   ├── coach/       # Coach agent
│   │   │   │   ├── synthesis/   # Synthesis agent
│   │   │   │   ├── friend/      # Reading friend system
│   │   │   │   ├── memory/      # Memory and knowledge graph
│   │   │   │   └── tools/       # Agent tools (search, DB, etc)
│   │   │   ├── db/              # Database clients
│   │   │   ├── middleware/      # Express middleware
│   │   │   └── utils/           # Utilities
│   │   ├── tests/               # API tests
│   │   └── package.json
│   │
│   ├── shared/                  # Shared code
│   │   ├── src/
│   │   │   ├── types/           # Shared TypeScript types
│   │   │   ├── constants/       # Shared constants
│   │   │   ├── utils/           # Shared utilities
│   │   │   └── validators/      # Shared validation schemas
│   │   └── package.json
│   │
│   └── infra/                   # Infrastructure as code
│       ├── terraform/           # AWS infrastructure
│       ├── docker/              # Docker configurations
│       └── k8s/                 # Kubernetes manifests (future)
│
├── scripts/                     # Utility scripts
│   ├── setup.sh                 # Project setup
│   ├── dev.sh                   # Development environment
│   ├── test.sh                  # Run tests
│   └── deploy.sh                # Deployment script
│
├── .gitignore
├── .env.example                 # Environment variables template
├── docker-compose.yml           # Local development
├── package.json                 # Root package.json
├── pnpm-workspace.yaml          # Monorepo workspace config
└── turbo.json                   # Turborepo config
```

## Development Guidelines

### Core Principles
1. **Reader-First Design** - Every feature serves the reader's experience
2. **Emotional Intelligence** - AI should feel like a friend, not a tool
3. **Privacy by Default** - User data is owned and controlled by users
4. **Scientific Learning** - Use evidence-based learning techniques
5. **Transparent AI** - Always clear when AI is speaking

### Code Style
- Use TypeScript for type safety
- Follow existing code style (see `.claude/rules/code-style.md`)
- Write tests for new features (see `.claude/rules/testing.md`)
- Keep functions under 50 lines
- Use meaningful variable and function names
- Document complex logic with inline comments
- Use early returns to reduce nesting

### AI Agent Development
- Follow Claude Agent SDK best practices
- Each agent has a single, clear purpose
- Agents use tools (don't hard-code functionality)
- Implement proper error handling and fallbacks
- Log agent decisions for debugging
- Test agent responses thoroughly

See `.claude/rules/ai-agents.md` for detailed guidelines.

### Reading Friend Design
- Personalities are consistent and well-defined
- Conversations feel natural, not scripted
- Friend knows when to speak and when to stay silent
- Emotional boundaries are respected
- User always controls interaction frequency
- Data is transparently managed

See `.claude/rules/reading-friend.md` for detailed guidelines.

## Commands

### Development Commands
- `/project:feature` - Develop a new feature with guided workflow
- `/project:review` - Run comprehensive code review
- `/project:fix-issue` - Fix a specific issue with investigation
- `/project:test` - Run test suite with coverage
- `/project:deploy` - Deploy to staging/production

### AI Agent Commands
- `/agent:create` - Create a new AI agent
- `/agent:test` - Test an AI agent's responses
- `/agent:tune` - Fine-tune agent personality
- `/agent:debug` - Debug agent behavior

### Reading Friend Commands
- `/friend:create` - Create a new reading friend persona
- `/friend:chat` - Simulate conversation with a friend
- `/friend:memory` - Generate memory book for a reading journey

## Development Workflow

### Starting Development
```bash
# Clone and setup
git clone <repo-url>
cd read-pal
pnpm install
pnpm setup

# Start development environment
pnpm dev
```

### Running Tests
```bash
# All tests
pnpm test

# Specific package
pnpm test --filter=@read-pal/api

# Watch mode
pnpm test:watch
```

### Building
```bash
# All packages
pnpm build

# Specific package
pnpm build --filter=@read-pal/web
```

### Local Development
```bash
# Full stack (API + Web + Mobile)
pnpm dev

# API only
pnpm dev:api

# Web only
pnpm dev:web

# Mobile (requires Expo)
pnpm dev:mobile
```

## Key Features by Phase

### Phase 1: Foundation (Months 1-3)
- ✅ Basic reading interface (EPUB, PDF)
- ✅ Single Companion Agent
- ✅ User authentication
- ✅ Library management
- ✅ Annotation system
- ✅ Web application beta

### Phase 2: Multi-Agent System (Months 4-6)
- ⏳ Research Agent
- ⏳ Coach Agent
- ⏳ Synthesis Agent
- ⏳ Knowledge graph MVP
- ⏳ Mobile apps (iOS/Android)

### Phase 3: Reading Friend (Months 7-9)
- ⏳ Reading Friend System with personalities
- ⏳ Conversation with Books
- ⏳ Proactive coaching
- ⏳ Memory book generation
- ⏳ Browser extension

### Phase 4: Launch (Months 10-12)
- ⏳ Collaborative reading features
- ⏳ E-reader integrations
- ⏳ Advanced analytics
- ⏳ Public launch

## Environment Variables

Required environment variables (see `.env.example`):

```env
# API
API_PORT=3001
API_URL=http://localhost:3001

# Database
DATABASE_URL=postgresql://...
REDIS_URL=redis://localhost:6379

# Vector DB
PINECONE_API_KEY=***
PINECONE_ENVIRONMENT=***

# Graph DB
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=***

# Claude AI
ANTHROPIC_API_KEY=***

# Authentication
AUTH0_SECRET=***
AUTH0_DOMAIN=***

# Storage
S3_BUCKET=***
AWS_ACCESS_KEY_ID=***
AWS_SECRET_ACCESS_KEY=***

# Analytics
MIXPANEL_TOKEN=***
SENTRY_DSN=***
```

## Contributing

See `docs/contributing.md` for detailed contribution guidelines.

1. Fork the repository
2. Create a feature branch
3. Make your changes following our code style
4. Write tests for new functionality
5. Submit a pull request

## License

Proprietary - All rights reserved

## Contact

- **Product**: [Product information]
- **Support**: [Support contact]
- **Documentation**: See `/docs` directory

---

**Last Updated:** March 28, 2026
**Version:** 2.0.0 - Multi-Agent Reading Companion
