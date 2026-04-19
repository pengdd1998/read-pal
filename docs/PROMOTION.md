# Show HN: read-pal – An open-source AI reading companion that chats with your books

**TL;DR:** read-pal is an open-source AI reading companion. Upload any EPUB, and a personalized AI friend reads alongside you — asking questions, explaining passages, connecting ideas across books, and building a knowledge graph of everything you've learned. Built with FastAPI, Next.js, and LangChain. MIT licensed.

## The Problem

I read a lot of books but kept forgetting what I learned. I'd highlight passages in Kindle, export them to Readwise, and never look at them again. The problem isn't collection — it's comprehension and retention.

Passive reading tools (Kindle, Apple Books) give you a highlighter. Highlight collectors (Readwise, Matter) give you a database. But neither helps you *understand* what you're reading in the moment, or connect ideas across books weeks later.

## What read-pal Does

read-pal is an active reading partner:

1. **AI Companion Chat** — Highlight any passage and ask "why does this matter?" or "how does this connect to chapter 3?" Get instant, contextual answers. No switching tabs.

2. **5 Reading Friend Personas** — Choose a companion that matches your mood:
   - Sage (wise, asks deep questions)
   - Penny (enthusiastic, explores ideas)
   - Alex (challenger, pushes your thinking)
   - Quinn (quiet, speaks when needed)
   - Sam (study buddy, practical)

3. **Personal Knowledge Graph** — As you read and annotate, a visual graph grows connecting concepts across your entire library. See how ideas in "Thinking, Fast and Slow" relate to "Predictably Irrational" — automatically.

4. **Memory Books** — When you finish a book, read-pal weaves your highlights, notes, AI conversations, and insights into a beautiful 6-chapter personal document.

5. **Spaced Repetition** — SM-2 algorithm flashcards generated from your highlights. Review at optimal intervals.

6. **Book Clubs** — Create or join clubs, track progress, discuss chapters together.

## Technical Highlights

- **27 API routers, 130+ endpoints** — Full REST API with OpenAPI spec
- **320+ passing tests** — pytest backend, Vitest frontend
- **LangChain + GLM** — AI powered by Zhipu AI's GLM models (cost-effective alternative to OpenAI with strong multilingual support)
- **Connection pooling + circuit breaker** — LLM service with fallback model, health checks
- **RAG + conversation memory** — Retrieves relevant book passages and summarizes chat history
- **Docker Compose** — One command to deploy the full stack (PostgreSQL, Redis, FastAPI, Next.js, nginx)

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2.0 (async) |
| AI | LangChain + GLM (Zhipu AI) with circuit breaker |
| Frontend | Next.js 14, TypeScript, TailwindCSS |
| Database | PostgreSQL 16, Redis 7 |
| Knowledge | NetworkX graph engine |
| Testing | pytest (320+), Vitest (24) |

## Self-Host in 60 Seconds

```bash
git clone https://github.com/pengdd1998/read-pal.git
cd read-pal
cp .env.example .env  # Add your GLM API key
docker compose up -d
```

Open http://localhost:8090 and start reading.

## Why Open Source?

Reading is personal. Your highlights, notes, and AI conversations are intimate data. You should own them.

read-pal is MIT licensed. Self-host on your own server. Export your data anytime. No vendor lock-in.

## What's Next

- [ ] Mobile app (Capacitor)
- [ ] Browser extension (highlight on the web)
- [ ] PDF support
- [ ] Multi-agent system (Research, Coach, Synthesis agents)
- [ ] E-reader integrations (Kindle, Kobo)

## Links

- **GitHub:** https://github.com/pengdd1998/read-pal
- **Live Demo:** http://175.178.66.207:8090
- **Docs:** Full API spec at /docs when running

Looking for contributors, feedback, and beta testers. What would make YOU read more?
