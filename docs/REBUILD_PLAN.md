# read-pal Rebuild Plan

> Generated from 4-expert parallel review: Frontend Architect, Backend Architect, UI/UX Designer, Build/Infra Engineer.
> Updated: all-in Python backend, PWA → Capacitor multi-platform.
> Date: 2026-04-18

## Executive Summary

The current Node.js/Express backend served well for rapid prototyping, but the project's core features — AI agents, EPUB processing, knowledge graph, NLP — are Python's sweet spot. The Node.js EPUB parser is unmaintained since 2017, AI orchestration is a custom 644-line file that langchain handles in 50, and the TypeScript "shared types" advantage never materialized (only 6 of 25 types are actually used).

**Strategy: Python backend + multi-platform frontend.**

- **Backend:** Full migration to Python (FastAPI). Better AI/ML ecosystem, proper EPUB/PDF support, cleaner agent architecture.
- **Frontend:** Next.js stays. PWA → Capacitor for mobile.
- **API contract:** OpenAPI spec auto-generated from FastAPI + Pydantic. Frontend types generated from spec.

---

## Target Architecture

```
┌─────────────┐  ┌──────────────────┐  ┌───────────────┐
│  Next.js Web │  │ Capacitor Shell  │  │ Browser Ext   │
│  (SSR/SSG)  │  │ (iOS / Android)  │  │  (Future)     │
│  + PWA      │  │ wraps same web   │  │               │
└──────┬──────┘  └──────┬───────────┘  └───────┬───────┘
       │                │                       │
       └────────────────┼───────────────────────┘
                        │  REST /api/v1/
                        │  OpenAPI spec as contract
              ┌─────────▼──────────┐
              │  FastAPI (Python)  │
              │  Async, typed      │
              │  Pydantic models   │
              │  Auto OpenAPI gen  │
              └─────────┬──────────┘
                        │
              ┌─────────▼──────────┐
              │  Service Layer     │
              │  book_service      │
              │  annotation_service│
              │  agent_service     │  ← langchain for orchestration
              │  epub_service      │  ← ebooklib for EPUB parsing
              │  knowledge_service │  ← NetworkX for graph ops
              │  export_service    │
              └─────────┬──────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼────┐  ┌──────▼─────┐  ┌────▼────┐
    │PostgreSQL│  │   Redis    │  │ Pinecone│
    │SQLAlchemy│  │  aioredis  │  │  python │
    │ Alembic  │  │            │  │  client │
    └─────────┘  └────────────┘  └─────────┘
```

### Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Backend language** | Python 3.12+ | Best AI/ML ecosystem, proper EPUB/PDF libraries, langchain for agents |
| **Web framework** | FastAPI | Async, Pydantic validation, auto-generated OpenAPI spec, great DX |
| **ORM** | SQLAlchemy 2.0 (async) | Mature, async support, Alembic migrations |
| **API design** | REST `/api/v1/` | Versioned for mobile clients, OpenAPI as contract |
| **Type contract** | OpenAPI spec → codegen | Frontend types auto-generated from API spec, no manual shared package |
| **Mobile strategy** | PWA → Capacitor | Same HTML reader, no native EPUB rewrite needed |
| **Auth** | JWT + refresh tokens | Works across web, PWA, and native platforms |
| **Offline** | Service Worker + IndexedDB | Download books, queue annotations, sync when online |
| **AI orchestration** | langchain | Tool chaining, memory management, agent routing — replaces custom 644-line orchestrator |
| **EPUB parsing** | ebooklib | Actively maintained, proper chapter/metadata extraction — replaces `epub@0.1.3` (2017) |
| **Knowledge graph** | NetworkX | Mature graph library — replaces 708 lines of custom JS |
| **PDF support** | pypdf / pdfplumber | Easy to add — Node.js version wasn't built |

### Python Tech Stack

| Layer | Library | Purpose |
|-------|---------|---------|
| Web framework | **FastAPI** | Async API with auto OpenAPI, Pydantic validation |
| ASGI server | **Uvicorn** | Production server (or Gunicorn + Uvicorn workers) |
| ORM | **SQLAlchemy 2.0** (async) | Database models, queries |
| Migrations | **Alembic** | Database schema migrations |
| Validation | **Pydantic v2** | Request/response schemas, settings |
| Auth | **PyJWT** + **passlib** (bcrypt) | JWT tokens, password hashing |
| Database driver | **asyncpg** | Async PostgreSQL |
| Cache | **redis** (aioredis) | Async Redis client |
| Vector DB | **pinecone-client** | Semantic search |
| AI | **openai** SDK | GLM API calls (OpenAI-compatible) |
| AI orchestration | **langchain** | Agent tools, chains, memory |
| EPUB | **ebooklib** | EPUB parsing, chapter extraction |
| PDF | **pypdf** | PDF text extraction |
| NLP | **spacy** (optional) | Genre detection, entity extraction |
| Knowledge graph | **NetworkX** | Graph construction, traversal |
| Task queue | **Celery** + **Redis** (future) | Background tasks (book generation, export) |
| Testing | **pytest** + **httpx** | API testing |
| Settings | **pydantic-settings** | Typed env var loading |

---

## New Project Structure

```
read-pal/
├── packages/
│   ├── api/                  # DEPRECATED — Node.js backend (frozen)
│   │
│   ├── server/               # NEW — Python backend
│   │   ├── pyproject.toml    # uv/poetry dependencies
│   │   ├── alembic/          # Database migrations
│   │   │   ├── versions/
│   │   │   └── env.py
│   │   ├── app/
│   │   │   ├── __init__.py
│   │   │   ├── main.py              # FastAPI app, CORS, lifespan
│   │   │   ├── config.py            # Pydantic settings (env vars)
│   │   │   ├── db.py                # SQLAlchemy engine, session
│   │   │   │
│   │   │   ├── models/              # SQLAlchemy models
│   │   │   │   ├── user.py
│   │   │   │   ├── book.py
│   │   │   │   ├── annotation.py
│   │   │   │   ├── chapter.py
│   │   │   │   ├── reading_session.py
│   │   │   │   ├── book_club.py
│   │   │   │   ├── webhook.py
│   │   │   │   └── shared_export.py
│   │   │   │
│   │   │   ├── schemas/             # Pydantic request/response schemas
│   │   │   │   ├── auth.py
│   │   │   │   ├── book.py
│   │   │   │   ├── annotation.py
│   │   │   │   ├── agent.py
│   │   │   │   ├── book_club.py
│   │   │   │   └── export.py
│   │   │   │
│   │   │   ├── routers/             # FastAPI route handlers (thin)
│   │   │   │   ├── auth.py
│   │   │   │   ├── books.py
│   │   │   │   ├── upload.py
│   │   │   │   ├── annotations.py
│   │   │   │   ├── agent.py
│   │   │   │   ├── friend.py
│   │   │   │   ├── book_clubs.py
│   │   │   │   ├── knowledge.py
│   │   │   │   ├── synthesis.py
│   │   │   │   ├── share.py
│   │   │   │   ├── webhooks.py
│   │   │   │   ├── stats.py
│   │   │   │   ├── flashcards.py
│   │   │   │   └── health.py
│   │   │   │
│   │   │   ├── services/            # Business logic
│   │   │   │   ├── book_service.py
│   │   │   │   ├── annotation_service.py
│   │   │   │   ├── epub_service.py       # ebooklib EPUB parsing
│   │   │   │   ├── pdf_service.py        # pypdf PDF parsing
│   │   │   │   ├── agent_service.py      # langchain orchestration
│   │   │   │   ├── companion_agent.py    # Reading companion
│   │   │   │   ├── friend_agent.py       # Reading friend
│   │   │   │   ├── knowledge_service.py  # NetworkX graph
│   │   │   │   ├── export_service.py     # Multi-format export
│   │   │   │   ├── memory_book_service.py
│   │   │   │   ├── share_service.py
│   │   │   │   └── flashcard_service.py  # SM-2 spaced repetition
│   │   │   │
│   │   │   ├── middleware/
│   │   │   │   ├── auth.py              # JWT verification
│   │   │   │   ├── rate_limit.py
│   │   │   │   └── error_handler.py
│   │   │   │
│   │   │   └── utils/
│   │   │       ├── security.py          # Token generation, hashing
│   │   │       ├── pagination.py
│   │   │       └── exceptions.py
│   │   │
│   │   └── tests/
│   │       ├── conftest.py
│   │       ├── test_auth.py
│   │       ├── test_books.py
│   │       ├── test_annotations.py
│   │       ├── test_agent.py
│   │       └── test_epub.py
│   │
│   ├── web/                  # Next.js frontend (stays)
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       ├── lib/
│   │       │   └── api.ts    # Update base URL to Python backend
│   │       └── hooks/
│   │
│   └── shared/               # DEPRECATED — replaced by OpenAPI codegen
│
├── docs/
│   └── REBUILD_PLAN.md
└── docker-compose.yml
```

---

## Phase 1: Python Backend Foundation (Week 1-2)

Build the new Python backend alongside the existing Node.js one. Both run simultaneously.

### 1.1 Project Setup

| # | Action | Details |
|---|--------|---------|
| P1 | Initialize `packages/server/` | FastAPI project with uv/poetry |
| P2 | Configure `pyproject.toml` | All dependencies, Python 3.12+ |
| P3 | Database connection | SQLAlchemy async engine + asyncpg, same PostgreSQL |
| P4 | Redis connection | aioredis, same Redis instance |
| P5 | Settings management | `pydantic-settings` with `.env` loading, env validation on startup |
| P6 | CORS + middleware | Same origins as Node.js, rate limiting |

### 1.2 Auth System (port from Node.js)

The auth system works well in Node.js. Port it faithfully — same JWT structure, same password hashing, same rate limiting.

| # | Action | Details |
|---|--------|---------|
| A1 | User model | SQLAlchemy model matching current DB schema |
| A2 | Password hashing | passlib bcrypt (same algorithm, same hashes) |
| A3 | JWT tokens | PyJWT, same secret, same expiry, same refresh flow |
| A4 | Auth routes | `/api/v1/auth/login`, `/register`, `/me`, `/forgot-password`, `/reset-password`, `/refresh`, `/logout` |
| A5 | Rate limiting | Same lockout logic (5 attempts, 15 min lock) |
| A6 | Token revocation | Same Redis-based revocation store |

### 1.3 Core CRUD Routes

Port the simple, working routes first. These validate the Python backend works end-to-end.

| # | Route Group | Endpoints |
|---|-------------|-----------|
| C1 | Books | CRUD, `/tags`, `/seed-sample`, `/stats` |
| C2 | Annotations | CRUD, `/tags`, `/search`, `/stats/chapters` |
| C3 | Settings | GET/PATCH user settings |
| C4 | Reading Sessions | CRUD, stats |
| C5 | Health | `/api/v1/health` |

### 1.4 Frontend Switch

| # | Action | Details |
|---|--------|---------|
| F1 | Update `api.ts` base URL | Point to Python backend (port 8000) |
| F2 | Add `/api/v1/` prefix | All frontend API calls update from `/api/` to `/api/v1/` |
| F3 | Verify all CRUD flows | Books, annotations, settings, auth work against Python |
| F4 | Run both backends in parallel | Node.js on 3001, Python on 8000, nginx routes traffic |

---

## Phase 2: AI + Content Processing (Week 3-4)

The features where Python dramatically outperforms Node.js.

### 2.1 EPUB + PDF Processing

| # | Action | Details |
|---|--------|---------|
| E1 | EPUB parsing with ebooklib | Replace unmaintained `epub@0.1.3` — proper chapter extraction, metadata, TOC |
| E2 | PDF text extraction | New capability — pypdf extracts text, creates chapters by page ranges |
| E3 | Content processing | Clean HTML, split chapters, generate embeddings for Pinecone |
| E4 | Upload endpoint | `/api/v1/upload` — handles EPUB and PDF, stores in same schema |

### 2.2 AI Agent System

| # | Action | Details |
|---|--------|---------|
| A1 | langchain setup | Agent framework with tool chaining, memory, prompt templates |
| A2 | Companion agent | Reading companion with context enrichment — replace custom CompanionAgent.ts |
| A3 | Reading friend | Personality-based friend agent — replace custom FriendAgent.ts |
| A4 | Agent routes | `/api/v1/agent/chat`, `/stream` (SSE), `/explain`, `/summarize` |
| A5 | Conversation persistence | Store in PostgreSQL, not in-memory Map — survives restarts |
| A6 | Cost guard | Token counting and max-cost-per-request — missing in Node.js version |
| A7 | Streaming | SSE streaming with langchain callbacks — same UX as current |

### 2.3 Knowledge Graph

| # | Action | Details |
|---|--------|---------|
| K1 | NetworkX graph construction | Replace 708 lines of custom JS — 50 lines of Python |
| K2 | Concept extraction | spacy NER + GLM for synthesis |
| K3 | Graph routes | `/api/v1/knowledge/graph`, `/search`, `/concepts` |
| K4 | Graph visualization API | Return graph data as JSON — frontend SVG rendering stays the same |

### 2.4 Synthesis + Export

| # | Action | Details |
|---|--------|---------|
| S1 | Synthesis service | Cross-reference, concept map, theme analysis, timeline |
| S2 | Export service | Multi-format export (CSV, Markdown, HTML, PDF, Zotero) |
| S3 | Personal Reading Book | 6-chapter pipeline — cleaner in Python with local + cloud models |
| S4 | Memory book generation | GLM enrichment calls + HTML rendering |

---

## Phase 3: Remaining Routes + Decommission Node.js (Week 5)

### 3.1 Port Remaining Routes

| # | Route Group | Notes |
|---|-------------|-------|
| R1 | Book Clubs | CRUD, join/leave, members, discussions — with proper authorization (fix current no-op `requirePermission`) |
| R2 | Webhooks | CRUD, HMAC delivery, delivery logs — with HTTPS-only validation |
| R3 | Share | Share tokens with 256-bit entropy (fix current 64-bit), export sharing |
| R4 | Flashcards | SM-2 algorithm — simpler in Python with dataclasses |
| R5 | Stats | Dashboard data, reading calendar, reading speed |
| R6 | Notifications | Notification management |
| R7 | Discovery | Book recommendations |
| R8 | Interventions | AI-powered reading interventions |
| R9 | Mood | Reading mood tracking |

### 3.2 Security Fixes (built into Python from day one)

| Issue | How Python version prevents it |
|-------|-------------------------------|
| `requirePermission` no-op | Proper dependency injection, role decorator on routes |
| Share tokens 64-bit | `secrets.token_urlsafe(32)` — 256-bit default |
| LIKE injection | SQLAlchemy parameterized queries, no raw `%${search}%` |
| Email in logs | Structured logging with PII filters |
| HTTP webhook URLs | Pydantic URL validator with `https://` constraint |
| Missing transactions | SQLAlchemy session-based transactions, context managers |
| `sequelize.sync()` in production | Alembic migrations only — no auto-sync |

### 3.3 Decommission Node.js

| # | Action | Details |
|---|--------|---------|
| D1 | Verify all routes ported | Every Node.js endpoint has Python equivalent |
| D2 | Run side-by-side for 48 hours | Mirror traffic, compare responses |
| D3 | Switch nginx to Python only | Route all `/api/` to FastAPI |
| D4 | Stop PM2 `read-pal-api` process | Keep code frozen in repo for reference |
| D5 | Remove `packages/api/` from workspace | Archive, don't delete — git history preserved |

---

## Phase 4: Frontend Architecture (Week 5-6)

Runs in parallel with Phase 2-3. Independent of backend migration.

### 4.1 Split Monolithic Pages

| File | Lines | Extract To |
|------|-------|-----------|
| `settings/page.tsx` | 1121 | `components/settings/` — 5 section components |
| `read/[bookId]/page.tsx` | 1015 | `components/reading/` — SelectionHint, ShortcutsHelp, SettingsDropdown |
| `dashboard/page.tsx` | 910 | `components/dashboard/` — 7 widget components |
| `book/[id]/page.tsx` | 881 | `components/book/` — ShareQuote, ReadingInsights, ExportPanel, ZoteroPanel |

### 4.2 Extract ReaderContext

Eliminate prop drilling (10+ props to 5 children):

```typescript
interface ReaderContextValue {
  book: Book;
  chapters: Chapter[];
  currentChapter: number;
  annotations: Annotation[];
  theme: Theme;
  fontSize: number;
}
```

### 4.3 Design System Unification

| Action | Details |
|--------|---------|
| Token system | `bg-surface-0/1/2`, `rounded-lg/xl/2xl/full`, `ring-amber-500` always |
| Fix Developers page | Replace stone colors with warm tokens, add dark mode |
| Fix Knowledge page | Replace `bg-stone-50` with `bg-surface-0` |
| Fix Book Clubs page | Replace `bg-gray-50/50` with `bg-surface-0` |
| Remove hardcoded hex | AppShell and all pages use design tokens |

### 4.4 Frontend Type Contract

Replace `@read-pal/shared` with OpenAPI-generated types:

```
FastAPI Pydantic schemas → OpenAPI spec (auto-generated) → openapi-typescript → TypeScript types
```

- No more manual shared package
- Frontend types always match the API (generated from spec)
- Add to CI: regenerate types on every backend change

### 4.5 PWA Foundation

| # | Action | Details |
|---|--------|---------|
| W1 | Responsive audit | Every page at 375px, fix touch targets |
| W2 | Bottom nav expansion | Add "More" menu for Memory Books, Knowledge, Stats, Book Clubs |
| W3 | PWA manifest | Proper icons, standalone display, theme_color |
| W4 | Service worker | Cache book content, queue annotations offline |

---

## Phase 5: Capacitor Wrapper (Week 7-8)

After web is responsive and Python API is stable.

### 5.1 Capacitor Setup

| Action | Details |
|--------|---------|
| Add Capacitor | `npx cap init`, iOS + Android platforms |
| Static export | Next.js `output: 'export'` for Capacitor |
| Native splash | Brand-colored splash screen |
| App icons | All required sizes for both platforms |

### 5.2 Native Plugins

| Plugin | Purpose |
|--------|---------|
| `@capacitor/local-notifications` | Reading reminders, streak alerts |
| `@capacitor/push-notifications` | Book club updates, friend messages |
| `@capacitor/filesystem` | Download books locally |
| `@capacitor/share` | Share highlights/quotes natively |
| `@capacitor/haptics` | Tactile feedback on page turns |
| `@capacitor/status-bar` | Immersive reading mode |

### 5.3 Offline-First

| Action | Details |
|--------|---------|
| IndexedDB book cache | Download full books for offline reading |
| Annotation queue | Create/update offline, sync when online |
| Conflict resolution | Last-write-wins with server timestamp |
| Background sync | Service worker syncs on connection restore |

---

## Phase 6: Testing & Launch (Week 9-10)

| Action | Details |
|--------|---------|
| pytest for all API routes | Auth, books, annotations, agents, book clubs |
| Integration tests | Full flow: register → upload → read → highlight → chat → export |
| Frontend tests | Core reading flow E2E |
| Load testing | `locust` for Python API performance baseline |
| App Store prep | Screenshots, privacy policy, TestFlight beta |
| Update CLAUDE.md | New architecture, Python commands, deploy process |

---

## Migration Strategy

**Strangler fig pattern:** Python backend grows route by route. Node.js shrinks.

```
Week 1-2:  Python = auth + CRUD.      Node.js = everything else.
           nginx routes /api/v1/auth/* → Python, /api/* → Node.js

Week 3-4:  Python += AI + EPUB + knowledge.
           Node.js = book clubs, webhooks, share, flashcards.

Week 5:    Python += remaining routes.  Node.js = frozen.
           Mirror traffic for 48h, then switch fully.

Week 5-8:  Frontend refactoring + PWA + Capacitor (parallel).

Week 9-10: Testing + launch.
```

**Branching:**
- `feat/python-api` — new Python backend
- `refactor/frontend` — page splits, design system, PWA
- `main` stays stable, Node.js keeps running until Phase 3.3

---

## Deployment

### Python Backend (replaces Node.js API)

```bash
# packages/server/
uv sync                          # Install dependencies
alembic upgrade head             # Run migrations
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# PM2 equivalent
pm2 start "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4" --name read-pal-api
```

### Frontend (stays the same)

```bash
cd packages/web
NEXT_PUBLIC_API_URL= pnpm build
pm2 restart read-pal-web
```

### nginx Configuration (new)

```nginx
# Route API traffic to Python backend
location /api/v1/ {
    proxy_pass http://127.0.0.1:8000;
}

# Legacy Node.js (during migration only)
location /api/ {
    proxy_pass http://127.0.0.1:3001;
}

# Next.js frontend
location / {
    proxy_pass http://127.0.0.1:3000;
}
```

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Python backend doesn't match Node.js behavior | Port tests first, run both in parallel, compare responses |
| Data loss during migration | Same PostgreSQL database, Alembic reads existing schema |
| Frontend breaks on API switch | Keep Node.js running, switch nginx routes one at a time |
| Performance regression | Load test with locust before switch, uvicorn workers = CPU cores |
| EPUB parsing differences | Test with all existing uploaded books, compare chapter output |
| Agent conversation format changes | Migrate in-memory history to DB first, then switch backend |
| Next.js static export breaks SSR | Audit SSR usage before Capacitor, keep dynamic rendering for web |

---

## Success Metrics

| Metric | Current (Node.js) | Target (Python) |
|--------|-------------------|-----------------|
| **EPUB parsing** | Unmaintained `epub@0.1.3` (2017) | ebooklib (active) |
| **PDF support** | None | pypdf (native) |
| **Agent orchestration** | Custom 644-line file | langchain (industry standard) |
| **Knowledge graph** | Custom 708-line JS | NetworkX (~50 lines) |
| **Conversation persistence** | In-memory Map (lost on restart) | PostgreSQL (durable) |
| **API spec** | Manual OpenAPI (661 lines) | Auto-generated from Pydantic |
| **Type contract** | Broken shared package (6/25 used) | OpenAPI → codegen (always in sync) |
| **Authorization** | `requirePermission` is no-op | Proper role decorators |
| **Database migrations** | `sequelize.sync()` (dangerous) | Alembic (safe, versioned) |
| **Platform support** | Web only | Web + PWA + iOS + Android |
| **Offline reading** | None | Full book download + sync |
| **Test framework** | Jest (broken config) | pytest (working) |
| **Route files > 300 lines** | 12/12 | 0 (thin routers + services) |
