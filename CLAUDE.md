# read-pal

## Project Overview

read-pal is an AI reading companion for students and reading enthusiasts. The core feature is the **Personal Reading Book** — when you finish a book, read-pal generates a unique document woven from your highlights, notes, AI conversations, and insights.

## Tech Stack

- **AI Engine:** GLM (Zhipu AI) via OpenAI-compatible API — `glm-4.7-flash`
- **Frontend:** Next.js 14 + TypeScript + TailwindCSS (standalone output)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL + Redis
- **Vector Search:** Pinecone
- **Build:** pnpm monorepo

## Project Structure

```
read-pal/
├── packages/
│   ├── api/          # Express API + AI agents
│   │   └── src/
│   │       ├── agents/   # AI agent system
│   │       ├── routes/   # REST endpoints
│   │       ├── services/ # Business logic (LLM, exports, etc.)
│   │       ├── models/   # Sequelize models
│   │       └── db/       # Database clients
│   ├── web/          # Next.js web app
│   │   └── src/
│   │       ├── app/          # App router pages
│   │       ├── components/   # React components
│   │       └── lib/          # API client, utilities
│   └── shared/       # Shared TypeScript types and utilities
├── docs/             # Documentation
└── .claude/          # Claude Code configuration
```

## Development Guidelines

### Code Quality
- Use TypeScript strictly — fix all implicit any types
- Follow existing code style (see `.claude/rules/code-style.md`)
- Keep functions under 50 lines
- Use early returns to reduce nesting

### Build Preferences
- Build standalone, dependency-free solutions first
- If npm/package installation fails, pivot to self-contained solutions

### Code Style
- 2-space indentation
- Single quotes for strings
- Trailing commas in multi-line structures
- Group imports: external packages first, then internal modules

## Environment Variables

Required (see `packages/api/.env.example`):

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=readpal
DB_USER=readpal
DB_PASSWORD=REDACTED_PASSWORD
REDIS_URL=redis://localhost:6379
GLM_API_KEY=***
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
DEFAULT_MODEL=glm-4.7-flash
JWT_SECRET=***
PINECONE_API_KEY=***
```

## Development Commands

```bash
pnpm install
pnpm --filter @read-pal/shared build

# Dev
pnpm --filter @read-pal/api dev      # port 3001
pnpm --filter @read-pal/web dev      # port 3000

# Typecheck
pnpm --filter @read-pal/api typecheck
pnpm --filter @read-pal/web typecheck

# Build
pnpm --filter @read-pal/api build
NEXT_PUBLIC_API_URL= pnpm --filter @read-pal/web build

# Test
pnpm --filter @read-pal/api test
```

## Deployment

Self-hosted on Ubuntu server (REDACTED_IP) with PM2 standalone mode.

### Deployment Rules
- Always use **absolute paths** in deploy scripts, never relative paths
- `NEXT_PUBLIC_*` env vars must be set **before** `next build`, not after
- After any deployment, verify with `curl` health check on both services
- SSH key: `~/.ssh/REDACTED_KEY`, server user: `ubuntu`
- PM2 processes: `read-pal-api` (port 3001), `read-pal-web` (port 3000)
- API working directory: `REDACTED_DEPLOY_PATH/packages/api` (absolute)
- Web build: `NEXT_PUBLIC_API_URL=` (empty, uses Next.js rewrites)

### Deploy Steps
```bash
# On server — copy-paste ready
cd REDACTED_DEPLOY_PATH && git pull origin main
cd packages/api && pnpm build && pm2 restart read-pal-api
cd REDACTED_DEPLOY_PATH/packages/web && NEXT_PUBLIC_API_URL= pnpm build && pm2 restart read-pal-web
# Verify
curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/books  # expect 401
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000             # expect 200
```

### Database Migrations
```bash
# Run on server with correct env vars
cd REDACTED_DEPLOY_PATH/packages/api
DB_HOST=localhost DB_PORT=5432 DB_NAME=readpal DB_USER=readpal DB_PASSWORD=REDACTED_PASSWORD \
  REDIS_URL='redis://:REDACTED_PASSWORD@localhost:6379' \
  node -e "require('./dist/db').sequelize.getQueryInterface().addColumn(...)"
```

## Autonomous Work Mode

- Do NOT ask clarifying questions when I say "build it" or "continue" — make reasonable decisions and deliver
- Favor delivering working output over process updates or status reports
- If an approach fails twice, **pivot immediately** to an alternative — don't retry the same strategy
- When building, prefer self-contained solutions over multi-service architectures requiring npm install chains
- Write intermediate results to disk frequently so work isn't lost on compaction

## TypeScript Standards

- Use strict TypeScript — no implicit `any` types
- After renaming files or moving imports, always run `tsc --noEmit` to verify
- Double-check import paths for typos before writing files
- Prefer named exports for better refactoring safety

## Key Features

### Personal Reading Book
The killer feature. When a user finishes a book (or has >10% progress), they can generate a Personal Reading Book — a 6-chapter document:

1. **Cover** — Book info, reader name, reading time, AI subtitle
2. **Reading Journey** — Timeline of milestones and pace patterns
3. **What Caught Your Eye** — Highlights grouped by AI-identified themes
4. **Your Voice** — Notes, tag cloud, emotional trajectory
5. **Conversations** — Curated top AI chat exchanges
6. **Looking Forward** — Recommendations, unresolved questions, reflection

Generation pipeline: `Collect data → 3 AI enrichment calls (GLM) → HTML render → Store`

### AI Companion
Single AI partner (GLM-powered) that chats with readers about the book in context. Conversations are stored and feed into the Personal Reading Book.

### Annotations
Highlights, notes, bookmarks with tags, colors, and chapter locations. All raw material for the Personal Reading Book.
