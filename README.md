# read-pal

> AI agent-based reading companion with multi-agent architecture, real-time chat, and professional reading UX.

## What's Built

### Web Application (Next.js)
- **Reading interface** with EPUB support, themes (light/dark/sepia), adjustable font size
- **Chapter navigation** with progress tracking and smooth transitions
- **Text selection toolbar** for highlights, notes, and copy
- **Annotations sidebar** with bookmark support
- **AI Companion Chat** — floating bubble with draggable positioning, real-time streaming
- **Library management** — book grid, upload, dashboard stats
- **Auth flow** — login/register with JWT

### Backend API (Express + TypeScript)
- **Multi-agent orchestrator** routing requests to specialized agents
- **5 AI agents**: Companion, Research, Coach, Synthesis, Friend
- **WebSocket** real-time streaming for agent responses
- **Semantic search** with Pinecone vector embeddings
- **Reading sessions** with heartbeat progress tracking
- **Annotations API** — highlights, notes, bookmarks, with chapter locations

### AI Engine
- **GLM (Zhipu AI)** via OpenAI-compatible API (`glm-4.7-flash` default)
- Originally designed for Claude Agent SDK; currently using GLM for cost efficiency
- Multi-agent orchestration with parallel/sequential execution

### Deployment
- **Self-hosted** on Ubuntu server (REDACTED_IP)
- PM2 process management (web on :3000, API on :3001)
- Cron-based auto-deploy polling GitHub every 2 minutes
- Next.js standalone output with API proxy via rewrites

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, TypeScript, TailwindCSS |
| **Backend** | Express, TypeScript |
| **AI** | GLM-4.7-flash (Zhipu AI, OpenAI-compatible) |
| **Database** | PostgreSQL, Redis |
| **Vector Search** | Pinecone |
| **Build** | pnpm monorepo, Turborepo |
| **Deploy** | PM2, cron-based CI/CD |

## Project Structure

```
read-pal/
├── packages/
│   ├── api/              # Express API + AI agents
│   │   └── src/
│   │       ├── agents/   # Multi-agent system (orchestrator + 5 agents)
│   │       ├── routes/   # REST endpoints
│   │       ├── services/ # Business logic (WebSocket, LLM, semantic search)
│   │       └── db/       # Database clients
│   ├── web/              # Next.js web app
│   │   └── src/
│   │       ├── app/      # App router pages
│   │       ├── components/ # React components (reading, library, dashboard)
│   │       ├── hooks/    # Custom hooks (text selection, annotations)
│   │       └── lib/      # API client, WebSocket client
│   ├── shared/           # Shared TypeScript types and constants
│   └── mobile/           # React Native scaffold (early stage)
├── docs/                 # Project documentation
├── .claude/              # Claude Code configuration
│   ├── rules/            # Development rules
│   ├── skills/           # Reusable workflows
│   └── agents/           # Subagent personas
└── .agents/skills/       # Frontend design skill library
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Build shared package first
pnpm --filter @read-pal/shared build

# Start API (port 3001)
pnpm --filter @read-pal/api dev

# Start web app (port 3000)
pnpm --filter @read-pal/web dev

# Build for production
pnpm --filter @read-pal/shared build
pnpm --filter @read-pal/web build
pnpm --filter @read-pal/api build
```

## Environment Variables

See `packages/api/.env.example` for required configuration:

- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis connection
- `GLM_API_KEY` — Zhipu AI API key
- `JWT_SECRET` — Token signing secret
- `PINECONE_API_KEY` — Pinecone vector search

## Documentation

- [Executive Summary](./docs/executive-summary.md)
- [Product Plan](./docs/product-plan.md)
- [API Structure](./docs/api-structure-summary.md)
- [Contributing](./docs/contributing.md)

## Roadmap

### Phase 1: Foundation (Current) ✅
- [x] Reading interface with EPUB support
- [x] Multi-agent AI system (5 agents)
- [x] Auth, library, annotations
- [x] Real-time chat with streaming
- [x] Self-hosted deployment

### Phase 2: Polish & Mobile
- [ ] React Native mobile app
- [ ] Reading Friend personalities
- [ ] Knowledge graph visualization
- [ ] Browser extension

### Phase 3: Scale
- [ ] Collaborative reading
- [ ] Memory book generation
- [ ] Public launch

## License

Proprietary — All rights reserved
