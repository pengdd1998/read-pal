# Show HN: read-pal — An AI reading companion that actually reads with you

**Title:** Show HN: read-pal – An AI friend who reads alongside you, remembers everything, and builds a Personal Reading Book from your highlights

---

**Body:**

Hey HN,

I built read-pal because I kept finishing books and remembering almost nothing a week later. I'd highlight passages, take notes, but never go back to them. The ideas would just... evaporate.

read-pal is an open-source AI reading companion. You upload an EPUB, and it gives you:

- **A reading friend who knows the book** — Highlight any passage and ask "why does this matter?" or "how does this connect to what I read last week?" It answers in context, not generic summaries
- **Smart annotations** — Highlights, notes, bookmarks with tags and colors. Your AI friend connects them across chapters automatically
- **Knowledge Graph** — Visualizes how concepts connect across everything you've read. Not just one book — your entire library
- **Personal Reading Book** — When you finish a book, read-pal weaves your highlights, notes, AI conversations, and insights into a unique document. It's like getting a personalized CliffsNotes written in your own words
- **Spaced-repetition flashcards** — Anki-style SM-2 algorithm for actually retaining what you learned
- **5 AI personas** — Each with a different style (Sage for deep analysis, Penny for casual discussion, Alex for speed, Quinn for research, Sam for book clubs)
- **8 export formats** — CSV, Markdown, HTML, Zotero, APA, MLA, Chicago, BibTeX

**Tech stack:** Python/FastAPI backend, Next.js 14 frontend, PostgreSQL, Redis, GLM for AI (via OpenAI-compatible API). Self-hosted with Docker Compose. Monorepo with pnpm.

The core insight: reading is already a great way to learn, but *retention* is where everyone falls off. read-pal makes reading active instead of passive by turning it into a conversation.

It's free and open source (MIT license). The live instance is at http://175.178.66.207:8090 and the code is on GitHub.

Would love feedback from fellow readers. What features would make you actually use something like this?

---

**Links:**
- Live: http://175.178.66.207:8090
- GitHub: https://github.com/pengjundong/read-pal

---

**Post tips for HN:**
- Post Tuesday-Thursday between 8-10 AM ET
- Answer every comment in the first 2 hours
- Lead with the personal problem, not features
- "remembering nothing a week later" resonates with every serious reader
