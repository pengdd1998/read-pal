# I Built an Open-Source AI Reading Companion — Here's What I Learned

*How a personal frustration with forgetting what I read turned into a full-stack open source project with 140+ API endpoints, 275 tests, and an AI that actually helps you understand books.*

---

## The Problem: I Read a Lot and Remember Nothing

I read constantly. Non-fiction, research papers, technical books. I'd highlight passages, export them to Readwise, maybe write a quick note. Then three weeks later, someone would ask me about a book I *just finished* and I'd draw a blank.

The problem isn't collection — Kindle, Apple Books, Readwise all do that well. The problem is **comprehension and retention**. Nobody was helping me *understand* what I was reading in the moment, or connect ideas across books later.

So I built read-pal.

## What read-pal Does

read-pal is an AI reading companion that reads alongside you. Think of it as a friend who's always read the same book and loves talking about it.

**Three things make it different from existing tools:**

### 1. Active Reading, Not Passive Highlighting

When you highlight a passage in Kindle, nothing happens. In read-pal, you highlight any text and:
- Ask "why does this matter?" and get an instant, contextual answer
- The AI asks *you* questions to deepen understanding
- Your highlights feed into a knowledge graph that connects ideas across books

It's the difference between marking a page and having a conversation about it.

### 2. Five Reading Friend Personas

Not everyone wants the same kind of study buddy. read-pal has 5 distinct AI personas:

- **Sage** — Wise & patient, asks deep philosophical questions
- **Penny** — Enthusiastic explorer, gets excited about connections
- **Alex** — Gentle challenger, pushes your thinking in new directions
- **Quinn** — Quiet companion, speaks only when it matters most
- **Sam** — Practical study buddy, helps you get the most from every page

Each persona has a distinct personality that changes how the AI interacts with you. The companion remembers your reading history and adapts its responses.

### 3. Your Reading Becomes Knowledge

Everything you do in read-pal feeds into a personal knowledge system:

- **Knowledge Graph** — Concepts from different books connect automatically. See how "Thinking, Fast and Slow" relates to "Predictably Irrational" without manually linking anything.
- **Memory Books** — When you finish a book, read-pal generates a beautiful 6-chapter document woven from your highlights, notes, AI conversations, and insights. It's your reading journey, compiled.
- **Spaced Repetition** — SM-2 algorithm flashcards generated from your highlights. Review at optimal intervals to actually retain what you learned.

## Technical Deep-Dive

Here's what's under the hood — because I know you're curious.

### Architecture

```
nginx (8090)
├── Next.js 14 frontend (SSR + static)
└── FastAPI backend
    ├── SQLAlchemy 2.0 (async) → PostgreSQL
    ├── Redis (caching + sessions)
    ├── LangChain + GLM (Zhipu AI) → AI conversations
    └── NetworkX → Knowledge graph
```

The full stack runs in Docker Compose with 5 containers. One command to deploy everything.

### AI Pipeline

The AI companion uses a multi-layered approach:

1. **RAG (Retrieval-Augmented Generation)** — When you ask a question, relevant passages from the book are retrieved and included in the context. The AI doesn't just guess — it references the actual text.

2. **Conversation Memory** — Previous conversations are summarized and included so the AI remembers what you discussed yesterday, last week, or last month.

3. **Genre-Aware Prompts** — The system detects book genre (fiction, academic, technical) and adjusts the companion's behavior. A fiction reader gets character analysis; a technical reader gets implementation tips.

4. **Circuit Breaker** — LLM APIs fail. The system has a circuit breaker with automatic fallback to a lighter model when the primary is down. No more broken conversations at 2 AM.

### Knowledge Graph

Every highlight, note, and AI conversation feeds into a NetworkX graph. Concepts are extracted and connected across books. The visualization is a force-directed SVG that you can actually explore interactively.

### Scale of the Codebase

- **27 API routers, 140+ endpoints** — Auth, Books, Annotations, AI Companion, Knowledge Graph, Flashcards, Book Clubs, Export, Webhooks...
- **275 backend tests** — Every router is tested. pytest with async support.
- **50+ React components** — Reader view, companion chat, knowledge graph, memory books, annotations sidebar...
- **16 database models** — Full SQLAlchemy ORM with Alembic migrations.

## Why Open Source?

Three reasons:

**1. Your reading data is personal.** Your highlights, notes, AI conversations — that's intimate data. You should own it. Self-host on your own server. Export everything anytime. No vendor lock-in.

**2. AI should be transparent.** When an AI tells you what a book passage means, you should be able to see *how* it's doing it. Open source means you can inspect the RAG pipeline, the prompts, the conversation memory system.

**3. Reading is better together.** Book clubs, shared annotations, community knowledge graphs — these features only work with a community behind them.

## What I Learned Building This

### LLM Integration Is Harder Than It Looks

The hardest part wasn't calling an API. It was building a reliable system around it:
- Context windows fill up fast with book content. Summarization strategies matter.
- Streaming responses (SSE) are essential for chat UX but complicated with error handling.
- Rate limits and API failures are real. The circuit breaker pattern saved me more times than I can count.

### The "Active" In "Active Reading" Is Everything

The biggest UX insight: **passive tools don't change behavior**. A highlighter doesn't make you think about what you're highlighting. But when an AI asks you "what surprised you about this passage?" — you actually engage.

The companion personas matter more than I expected. People form genuine preferences. Some users *only* use Alex (the challenger) because they want their thinking pushed. Others want Penny (the enthusiast) for fiction.

### Self-Hosting Is Underrated

Docker Compose deployment means anyone can run this on a $5/month VPS. No AWS bills, no vendor dependencies. The entire stack — PostgreSQL, Redis, API, web, nginx — runs in 5 containers with one command.

## What's Next

- **Mobile app** via Capacitor (iOS + Android)
- **Browser extension** for highlighting on the web
- **PDF support** with OCR
- **Multi-agent system** — Research agent (web search), Coach agent (comprehension monitoring), Synthesis agent (advanced cross-document analysis)
- **E-reader integrations** — Kindle, Kobo

## Try It

```bash
git clone https://github.com/pengdd1998/read-pal.git
cd read-pal
cp .env.example .env  # Add your GLM API key
docker compose up -d
```

Open http://localhost:8090 and start reading.

If you're interested in contributing, check out the [good first issues](https://github.com/pengdd1998/read-pal/issues) — there are plenty of areas where we'd love help.

---

*read-pal is MIT licensed and available at [github.com/pengdd1998/read-pal](https://github.com/pengdd1998/read-pal). Feedback and contributions welcome.*
