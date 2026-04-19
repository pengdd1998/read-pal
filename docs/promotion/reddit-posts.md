# Reddit Posts

## r/SideProject

**Title:** I built an open-source AI reading companion that chats with your books

**Body:**

Hey everyone! After months of building, I want to share my side project: [read-pal](https://github.com/pengdd1998/read-pal).

**The problem:** I read a lot but kept forgetting what I learned. I'd highlight passages in Kindle, export to Readwise, and never look at them again.

**The solution:** An AI friend that reads alongside you. You can highlight any passage and ask "why does this matter?" or "how does this connect to chapter 3?" and get instant, contextual answers.

**Key features:**
- 5 AI reading personas (each with a distinct personality)
- Knowledge graph that connects ideas across books
- Memory books — beautiful compilations of your reading journey
- Spaced repetition flashcards from highlights
- Book clubs with discussions

**Tech stack:** FastAPI + Next.js 14 + LangChain + GLM (Zhipu AI). Full Docker Compose deployment.

**It's open source (MIT):** [github.com/pengdd1998/read-pal](https://github.com/pengdd1998/read-pal)

**Live demo:** [https://read-pal.example.com](https://read-pal.example.com) *(replace with your actual domain)*

Would love feedback! What would make you actually use something like this?

---

## r/opensource

**Title:** [Show] read-pal — Open-source AI reading companion with 130+ API endpoints, self-hostable

**Body:**

Built an open-source AI reading companion that you can self-host. Your reading data stays on your server.

[GitHub](https://github.com/pengdd1998/read-pal) | [Live Demo](https://read-pal.example.com)

**What it does:**
- Upload EPUBs, read alongside an AI companion that explains and asks questions
- Knowledge graph connects concepts across books
- Memory books compile your reading journey
- Spaced repetition flashcards
- Full REST API with OpenAPI spec

**Stack:** Python 3.12 / FastAPI / SQLAlchemy 2.0 (async) / Next.js 14 / LangChain / NetworkX

**Deployment:** `docker compose up -d` — PostgreSQL, Redis, FastAPI, Next.js, nginx in 5 containers.

**Stats:** 27 routers, 130+ endpoints, 320+ tests, 19 database models, MIT licensed.

Contributions welcome — there are good first issues for mobile, browser extension, i18n, and more.

---

## r/selfhosted

**Title:** read-pal — Self-hosted AI reading companion (Docker Compose, 5 containers)

**Body:**

Looking for a self-hosted alternative to Kindle + Readwise? I built [read-pal](https://github.com/pengdd1998/read-pal).

**One-command deploy:**
```bash
git clone https://github.com/pengdd1998/read-pal.git
cd read-pal
cp .env.example .env  # Add your API key
docker compose up -d
```

Runs 5 containers: PostgreSQL, Redis, FastAPI API, Next.js web, nginx reverse proxy.

**Features:**
- EPUB reader with AI companion chat
- Highlights, notes, bookmarks
- Knowledge graph (NetworkX)
- Memory books (AI-generated reading summaries)
- Spaced repetition flashcards
- Book clubs, export (APA/MLA/Markdown/JSON)
- Full REST API with OpenAPI spec

**Why self-host:** Your highlights, notes, and AI conversations are personal data. This keeps them on your server. MIT licensed.

[GitHub](https://github.com/pengdd1998/read-pal) | [Demo](https://read-pal.example.com)

---

## r/Python

**Title:** Built an AI reading companion with FastAPI + LangChain — 27 routers, 320+ tests, open source

**Body:**

Sharing a project that showcases modern Python backend architecture: [read-pal](https://github.com/pengdd1998/read-pal)

**Architecture highlights:**
- **27 API routers** with clean separation (routers → services → models)
- **SQLAlchemy 2.0 async** with proper session management
- **LangChain** for RAG pipeline with conversation memory
- **Circuit breaker** pattern for LLM API resilience
- **Pydantic v2** schemas for request/response validation
- **Alembic** migrations
- **pytest + pytest-asyncio** with 320+ tests

The AI companion uses RAG to retrieve relevant book passages, conversation memory for context, and genre-aware prompts. The circuit breaker automatically falls back to a lighter model when the primary LLM is down.

```python
# Example: clean router → service pattern
@router.post("/chat")
async def chat(request: ChatRequest, user=Depends(get_current_user)):
    return await companion_service.chat(user.id, request)
```

Full code at [github.com/pengdd1998/read-pal](https://github.com/pengdd1998/read-pal). MIT licensed.

---

## r/NextJS

**Title:** Built an AI reading companion with Next.js 14 — 25+ pages, 60+ components, open source

**Body:**

Sharing the frontend of my open-source AI reading companion: [read-pal](https://github.com/pengdd1998/read-pal)

**Frontend highlights:**
- **Next.js 14 App Router** with 25+ pages
- **60+ React components** — Reader view, AI companion chat, knowledge graph visualization, memory books
- **TypeScript strict mode** throughout
- **TailwindCSS** with design tokens and dark mode
- **Dynamic imports** for heavy reading components (code splitting)
- **Custom hooks** — useTextSelection, useReaderSettings, useStudyMode, etc.
- **SSE streaming** for real-time AI chat responses
- **PWA** with service worker and manifest

The reader view supports custom fonts, 3 themes (light/dark/sepia), and line height adjustment. The text selection system detects highlights and shows a floating toolbar for notes, AI questions, or bookmarking.

[GitHub](https://github.com/pengdd1998/read-pal) | [Live Demo](https://read-pal.example.com)
