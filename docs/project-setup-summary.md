# read-pal Project Status

## Current State (April 2026)

read-pal has a functional web application deployed on a self-hosted Ubuntu server with multi-agent AI capabilities.

## What's Built

### Web Application (packages/web)
- Next.js 14 app with TailwindCSS, custom design system
- Reading page with EPUB rendering, themes (light/dark/sepia), adjustable fonts
- Chapter navigation with smooth transitions and progress tracking
- Text selection toolbar for highlights, notes, and copy
- Annotations sidebar with bookmark support
- AI Companion Chat — floating draggable bubble with real-time streaming
- Library management with book grid and upload
- Dashboard with reading statistics
- Auth (login/register) with JWT

### API Server (packages/api)
- Express + TypeScript server on port 3001
- Multi-agent orchestrator routing to 5 AI agents:
  - **Companion**: Explanations, Q&A, summarization
  - **Research**: Semantic search across library (Pinecone)
  - **Coach**: Reading strategies, comprehension support
  - **Synthesis**: Cross-document analysis
  - **Friend**: Reading friend personality system
- WebSocket server for real-time streaming
- Full REST API: auth, books, annotations, reading sessions, stats, uploads
- PostgreSQL + Redis backend
- GLM (Zhipu AI) as the LLM engine via OpenAI-compatible API

### Shared Package (packages/shared)
- TypeScript types (Book, Chapter, Annotation, User, etc.)
- Shared constants (annotation colors, etc.)

### Mobile (packages/mobile)
- React Native/Expo scaffold (early stage)

### Deployment
- Self-hosted on Ubuntu server (192.168.1.13)
- PM2 manages web (:3000) and API (:3001)
- Cron-based auto-deploy polling GitHub every 2 minutes
- Next.js standalone output mode

## Architecture

```
Browser → Next.js (:3000) → /api/* rewrite → Express API (:3001)
                                               ├── Agents (GLM/Zhipu AI)
                                               ├── PostgreSQL
                                               ├── Redis
                                               └── Pinecone (vectors)
         WebSocket (:3001) → WS Manager → Agent streaming
```

## Key Technical Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| AI Engine | GLM (Zhipu AI) | Cost efficiency, OpenAI-compatible API |
| Frontend | Next.js standalone | SSR + API proxy in one server |
| Monorepo | pnpm workspaces | Shared types between packages |
| Deploy | PM2 + cron | Simple self-hosted, no cloud dependency |
| DB | PostgreSQL + Redis | Proven, simple, adequate for MVP |

## Commands

```bash
# Development
pnpm install
pnpm --filter @read-pal/shared build
pnpm --filter @read-pal/api dev     # port 3001
pnpm --filter @read-pal/web dev     # port 3000

# Production build
pnpm --filter @read-pal/shared build
NEXT_PUBLIC_API_URL= pnpm --filter @read-pal/web build
pnpm --filter @read-pal/api build

# Type checking
npx tsc --noEmit --project packages/web/tsconfig.json
npx tsc --noEmit --project packages/api/tsconfig.json
```

## Documentation

- `docs/executive-summary.md` — Product vision and business plan
- `docs/product-plan.md` — Full product specifications
- `docs/api-structure-summary.md` — API architecture details
- `docs/contributing.md` — Contribution guidelines
- `CLAUDE.md` — Project instructions for AI-assisted development

---

*Last updated: April 6, 2026*

## What's Been Created/Updated

### 📋 Core Documentation
- ✅ `CLAUDE.md` - Updated with full project vision and structure
- ✅ `README.md` - Public-facing project overview
- ✅ `docs/contributing.md` - Comprehensive contribution guidelines
- ✅ `.env.example` - Complete environment variable template
- ✅ `.gitignore` - Updated with all necessary exclusions

### 🎯 Product Documentation (Existing)
- `docs/executive-summary.md` - Quick overview and action plan
- `docs/product-plan.md` - Full product specifications
- `docs/expert-meeting-summary.md` - Expert consultation findings
- `docs/reading-friend-feature.md` - Reading friend deep dive

### 🤖 AI Agents (New)
- ✅ `.claude/agents/ai-agent-builder.md` - AI agent development specialist
- ✅ `.claude/agents/reading-friend-designer.md` - Reading friend UX designer

### 📏 Rules (Updated + New)
- ✅ `.claude/rules/code-style.md` (existing)
- ✅ `.claude/rules/testing.md` (existing)
- ✅ `.claude/rules/api-conventions.md` (existing)
- ✅ `.claude/rules/ai-agents.md` (NEW) - AI agent development rules
- ✅ `.claude/rules/reading-friend.md` (NEW) - Reading friend design rules

### 🔧 Commands (Updated)
- ✅ `.claude/commands/review.md` - Enhanced code review command
- ✅ `.claude/commands/fix-issue.md` - Enhanced issue fixing command
- ✅ `.claude/commands/deploy.md` - Enhanced deployment command
- ✅ `.claude/commands/feature.md` (NEW) - Feature development command
- ✅ `.claude/commands/test.md` (NEW) - Testing command

### 🛠️ Skills (New)
- ✅ `.claude/skills/agent-development/SKILL.md` - Auto-invoked agent development
- ✅ `.claude/skills/testing/SKILL.md` - Auto-invoked testing

### ⚙️ Configuration
- ✅ `.claude/settings.json` - Updated with skills, hooks, and commands
- ✅ `package.json` - Root package with scripts
- ✅ `pnpm-workspace.yaml` - Monorepo workspace configuration
- ✅ `turbo.json` - Turborepo pipeline configuration
- ✅ `docker-compose.yml` - Local development environment

## Project Structure

```
read-pal/
├── CLAUDE.md                      # ✅ Updated
├── CLAUDE.local.md                # ✅ Existing
├── README.md                      # ✅ Created
├── .env.example                   # ✅ Created
├── .gitignore                     # ✅ Updated
├── package.json                   # ✅ Created
├── pnpm-workspace.yaml            # ✅ Created
├── turbo.json                     # ✅ Created
├── docker-compose.yml             # ✅ Created
│
├── docs/                          # ✅ Product Documentation
│   ├── executive-summary.md       # ✅ Existing
│   ├── product-plan.md            # ✅ Existing
│   ├── expert-meeting-summary.md  # ✅ Existing
│   ├── reading-friend-feature.md  # ✅ Existing
│   ├── contributing.md            # ✅ Created
│   └── project-setup-summary.md   # ✅ This file
│
└── .claude/                       # ✅ Claude Code Configuration
    ├── settings.json              # ✅ Updated
    ├── commands/                  # ✅ Enhanced Commands
    │   ├── review.md              # ✅ Updated
    │   ├── fix-issue.md           # ✅ Updated
    │   ├── deploy.md              # ✅ Updated
    │   ├── feature.md             # ✅ Created
    │   └── test.md                # ✅ Created
    │
    ├── rules/                     # ✅ Development Rules
    │   ├── code-style.md          # ✅ Existing
    │   ├── testing.md             # ✅ Existing
    │   ├── api-conventions.md     # ✅ Existing
    │   ├── ai-agents.md           # ✅ Created
    │   └── reading-friend.md      # ✅ Created
    │
    ├── skills/                    # ✅ Auto-invoked Skills
    │   ├── security-review/       # ✅ Existing
    │   ├── deploy/                # ✅ Existing
    │   ├── agent-development/     # ✅ Created
    │   └── testing/               # ✅ Created
    │
    └── agents/                    # ✅ Specialist Agents
        ├── code-reviewer.md       # ✅ Existing
        ├── security-auditor.md    # ✅ Existing
        ├── ai-agent-builder.md    # ✅ Created
        └── reading-friend-designer.md # ✅ Created
```

## Next Steps

### 1. Initialize the Codebase
```bash
# Install dependencies
pnpm install

# Start local services
docker-compose up -d

# Setup environment
cp .env.example .env
# Edit .env with your configuration
```

### 2. Create Package Structure
```bash
# Create package directories
mkdir -p packages/api/src
mkdir -p packages/web/src
mkdir -p packages/mobile/src
mkdir -p packages/extension/src
mkdir -p packages/shared/src
mkdir -p packages/infra

# Initialize each package
pnpm --filter @read-pal/api init
# ... repeat for other packages
```

### 3. Begin Development
```bash
# Start development environment
pnpm dev

# Create first feature
/project:feature Implement basic reading interface

# Or start with an agent
/agent:create companion
```

## Development Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start all services |
| `pnpm test` | Run all tests |
| `pnpm build` | Build all packages |
| `pnpm lint` | Lint all code |
| `/project:feature` | Develop a new feature |
| `/project:review` | Review code changes |
| `/project:fix-issue` | Fix an issue |
| `/project:test` | Run tests with analysis |
| `/project:deploy` | Deploy to environment |

## Key Features to Implement

### Phase 1: Foundation (Months 1-3)
1. **Basic Reading Interface**
   - Document viewer (EPUB, PDF)
   - Library management
   - User authentication
   - Annotation system

2. **Companion Agent**
   - Concept explanation
   - Summarization
   - Q&A about text
   - Multi-language support

### Phase 2: Multi-Agent (Months 4-6)
1. **Research Agent**
   - Semantic search across library
   - Fact-checking with web search
   - Citation management

2. **Coach Agent**
   - Reading strategy recommendations
   - Comprehension monitoring
   - Spaced repetition scheduling

3. **Synthesis Agent**
   - Multi-document comparison
   - Knowledge graph construction
   - Cross-document insights

### Phase 3: Reading Friend (Months 7-9)
1. **Friend System**
   - Five personalities (Sage, Penny, Alex, Quinn, Sam)
   - Conversation management
   - Memory system

2. **Memory Books**
   - Timeline generation
   - Multiple export formats
   - Journey compilations

## Architecture Highlights

### AI Agent System
- **Claude Agent SDK** for multi-agent orchestration
- **Tool-based architecture** for extensibility
- **Model selection strategy** (Haiku/Sonnet/Opus)
- **Cost optimization** through smart routing

### Data Storage
- **PostgreSQL** for user data and library
- **Redis** for caching and sessions
- **Pinecone/Weaviate** for semantic search
- **Neo4j** for knowledge graphs

### Frontend Stack
- **React Native** for mobile apps
- **Next.js** for web application
- **Browser extension** for web content

## Team Structure (Suggested)

### Core Roles
- **Full-stack Developers** (2-3) - API, web, mobile
- **ML/AI Engineer** (1) - Agent development
- **Product Designer** (1) - UX/UI for reading friend
- **Backend Engineer** (1) - Database, infrastructure

### Advisors
- **AI/ML Specialist** - Claude Agent SDK expertise
- **EdTech Consultant** - Learning science
- **Legal Advisor** - Privacy, copyright

## Success Metrics

### Product KPIs
- DAU/MAU ratio > 30%
- 30-day retention > 70%
- AI feature adoption > 80% weekly

### Business KPIs
- Free-to-paid conversion > 10%
- NPS > 50
- Monthly churn < 5%

### Technical KPIs
- Agent response time < 500ms
- Uptime 99.9%
- API cost/user < $0.10/month

## Documentation Links

- **Product Vision:** `docs/executive-summary.md`
- **Full Specifications:** `docs/product-plan.md`
- **Expert Findings:** `docs/expert-meeting-summary.md`
- **Reading Friend:** `docs/reading-friend-feature.md`
- **Contribution Guide:** `docs/contributing.md`
- **Agent Rules:** `.claude/rules/ai-agents.md`
- **Friend Rules:** `.claude/rules/reading-friend.md`

---

**Project setup complete! Ready to build the first AI reading companion.** 🚀📚⚡

*Last Updated: March 28, 2026*
