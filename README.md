# read-pal

> AI reading companion that captures your reading journey and turns it into a personal book.

## What It Does

Students and reading enthusiasts read with an AI partner. Every highlight, note, and AI discussion feeds into a **Personal Reading Book** — a unique, AI-enriched document generated when you finish reading.

## Core Loop

```
Read → Highlight/Note/Ask AI → Everything is captured → Finish book → Get YOUR book
```

## What's Built

- **EPUB reader** with themes, font controls, chapter navigation
- **AI companion chat** — context-aware, streams in real time (GLM-powered)
- **Annotations** — highlights, notes, bookmarks with tags
- **Personal Reading Book** — 6-chapter document weaving your journey (reading timeline, themed highlights, notes, AI conversations, insights, recommendations)
- **Library & dashboard** — upload, browse, track reading streaks and stats

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, TypeScript, TailwindCSS |
| Backend | Express, TypeScript |
| AI | GLM-4.7-flash (Zhipu AI) |
| Database | PostgreSQL, Redis |
| Search | Pinecone (vectors) |
| Build | pnpm monorepo |
| Deploy | PM2 on self-hosted server |

## Project Structure

```
read-pal/
├── packages/
│   ├── api/       # Express API + AI agents
│   ├── web/       # Next.js web app
│   └── shared/    # Shared types and utilities
├── docs/          # Documentation
└── .claude/       # Claude Code config
```

## Getting Started

```bash
pnpm install
pnpm --filter @read-pal/shared build

# Dev
pnpm --filter @read-pal/api dev      # port 3001
pnpm --filter @read-pal/web dev      # port 3000

# Production build
pnpm --filter @read-pal/api build
NEXT_PUBLIC_API_URL= pnpm --filter @read-pal/web build
```

## Environment Variables

See `packages/api/.env.example`:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` — PostgreSQL
- `REDIS_URL` — Redis
- `GLM_API_KEY` — Zhipu AI
- `JWT_SECRET` — Auth
- `PINECONE_API_KEY` — Vector search

## Deployment

Self-hosted with PM2 standalone mode:

```bash
# On your server
cd /path/to/read-pal
git pull origin main
pnpm --filter @read-pal/api build
pm2 restart read-pal-api
NEXT_PUBLIC_API_URL= pnpm --filter @read-pal/web build
pm2 restart read-pal-web
```

## License

Proprietary — All rights reserved
