# Twitter/X Thread

## Thread 1: Product Launch (10 tweets)

**Tweet 1:**
I built an AI that reads books with you.

Highlight any passage, ask "why does this matter?", and get an instant answer in context. No switching tabs. No losing your place.

It's called read-pal. And it's open source. 🧵

**Tweet 2:**
The problem: I'd highlight passages in Kindle, export to Readwise, and never look at them again.

Passive reading tools give you a highlighter. Highlight collectors give you a database. Neither helps you *understand* what you're reading.

**Tweet 3:**
read-pal has 5 AI reading personas:

🧙 Sage — Wise & patient, asks deep questions
🌟 Penny — Enthusiastic, gets excited about ideas
⚡ Alex — Challenger, pushes your thinking
🌙 Quinn — Quiet, speaks when it matters
📚 Sam — Practical, focused on retention

You pick who reads with you.

**Tweet 4:**
The AI companion doesn't just answer questions. It asks them.

Reading a chapter on behavioral economics? The companion might ask: "How does loss aversion show up in your own decisions?"

Active reading > passive highlighting.

**Tweet 5:**
Every highlight, note, and conversation feeds into a personal knowledge graph.

Ideas from different books connect automatically. See how "Thinking, Fast and Slow" relates to "Predictably Irrational" — without manually linking anything.

**Tweet 6:**
When you finish a book, read-pal generates a "Memory Book" — a beautiful 6-chapter document woven from your highlights, notes, AI conversations, and insights.

Your reading journey, compiled.

**Tweet 7:**
Also includes:
- Spaced repetition flashcards (SM-2 / Anki-style)
- Reading streaks & activity heatmap
- Book clubs with discussions
- Export in APA, MLA, Chicago, Markdown, JSON

**Tweet 8:**
Tech stack:
- Python (FastAPI) + Next.js + LangChain
- 27 API routers, 140+ endpoints
- 275 tests, 16 database models
- Docker Compose — one command to deploy

All open source, MIT licensed.

**Tweet 9:**
Why open source?

Your reading data is personal. Highlights, notes, AI conversations — you should own all of it.

Self-host on a $5/month VPS. Export anytime. No vendor lock-in.

**Tweet 10:**
Try it:

```bash
git clone https://github.com/pengdd1998/read-pal.git
cd read-pal && docker compose up -d
```

Live demo: http://175.178.66.207:8090
GitHub: https://github.com/pengdd1998/read-pal

Star the repo if you find it useful! Would love your feedback. 🙏

---

## Thread 2: Technical Deep-Dive (8 tweets)

**Tweet 1:**
Let me show you what's under the hood of read-pal, my open-source AI reading companion.

Starting with the architecture 🧵

**Tweet 2:**
The stack:
- FastAPI (async) → SQLAlchemy 2.0 → PostgreSQL
- Redis for caching + sessions
- LangChain + GLM (Zhipu AI) for AI
- NetworkX for knowledge graph
- Next.js 14 (App Router) frontend

5 Docker containers, one `docker compose up -d`.

**Tweet 3:**
The AI pipeline is the most interesting part.

1. RAG — retrieves relevant book passages for context
2. Conversation memory — summarizes previous chats
3. Genre detection — adjusts prompts for fiction vs technical vs academic
4. Circuit breaker — falls back to lighter model when primary is down

**Tweet 4:**
The circuit breaker pattern saved me more times than I can count.

When GLM's API is overloaded (it happens), the system automatically:
- Detects failures
- Opens the circuit
- Falls back to a lighter model
- Retries the primary when it recovers

Zero broken conversations.

**Tweet 5:**
The knowledge graph uses NetworkX with force-directed layout.

Every highlight, note, and AI conversation extracts concepts. These get connected across books automatically. The visualization is an interactive SVG you can explore.

**Tweet 6:**
27 API routers, 140+ endpoints. Clean architecture:

Routers (thin) → Services (logic) → Models (ORM)

Every router is tested. 275 pytest tests with async support.

```python
@router.post("/chat")
async def chat(req: ChatRequest, user=Depends(auth)):
    return await companion.chat(user.id, req)
```

**Tweet 7:**
The frontend is 50+ React components with Next.js App Router:

- Reader view with custom themes/fonts
- SSE streaming for AI chat
- Text selection → floating toolbar → highlight/note/ask AI
- Dynamic imports for code splitting
- PWA with service worker

**Tweet 8:**
Full source code: https://github.com/pengdd1998/read-pal

MIT licensed. Contributions welcome — mobile, browser extension, i18n, PDF support.

Star the repo if you're interested in AI + reading + open source! ⭐
