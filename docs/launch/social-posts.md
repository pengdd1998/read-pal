# Social Media Launch Posts

## Twitter/X Thread

1/ I read 50+ books last year and forgot 90% of what I "learned." So I built read-pal — an AI friend who reads alongside you and makes sure you actually remember. Here's what it does: 🧵

2/ Upload any EPUB. Your AI companion reads the book with you. Highlight a passage, ask "why does this matter?" — get an instant, contextual answer. No tab-switching, no Googling, no losing your place.

3/ The Knowledge Graph is my favorite feature. It visualizes how concepts connect across everything you've read. Not just one book — your entire library becomes a web of ideas.

4/ But the killer feature is the Personal Reading Book. When you finish a book, read-pal weaves your highlights, notes, AI conversations, and insights into a unique document. Your own personalized CliffsNotes, in your own words.

5/ Also includes:
• Anki-style spaced repetition flashcards (SM-2 algorithm)
• 5 AI personas (Sage, Penny, Alex, Quinn, Sam)
• 8 export formats (CSV, Markdown, Zotero, APA, BibTeX, etc.)
• Reading streaks & daily goals
• 100% open source (MIT)

6/ Built with FastAPI + Next.js 14. Self-host with Docker Compose in minutes.

Try it free → http://175.178.66.207:8090
Star on GitHub → https://github.com/pengjundong/read-pal

What features would make you switch from your current reading setup?

## Reddit r/books Post

**Title:** I built an AI reading companion because I kept forgetting everything I read. It's free and open source.

**Body:**
Like many of you, I highlight passages, take margin notes, and tell myself I'll review them later. I never do. The highlights just sit there.

So I built read-pal — an AI that reads alongside you and actually helps you retain what you learn.

Key features:
- **Chat with your book** — Highlight any passage and ask questions. The AI knows the full context.
- **Personal Reading Book** — When you finish, it generates a document from your highlights, notes, and conversations. Your own summary, in your own words.
- **Knowledge Graph** — See how ideas connect across books
- **Flashcards** — Anki-style spaced repetition so you remember what you learned
- **8 export formats** — Works with Zotero, citation managers, etc.
- **Self-hostable** — Docker Compose, MIT license, full privacy

I'm a solo developer and this is my passion project. Would love feedback from actual readers.

Live: http://175.178.66.207:8090
GitHub: https://github.com/pengjundong/read-pal

## Reddit r/selfhosted Post

**Title:** read-pal — Self-hosted AI reading companion (FastAPI + Next.js, Docker Compose)

**Body:**
Hey r/selfhosted,

I built read-pal as a self-hostable alternative to Readwise/Kindle for people who want AI-powered reading without sending their books to third parties.

**Stack:** Python/FastAPI backend, Next.js 14 frontend, PostgreSQL, Redis. Single `docker compose up` gets you everything.

**Features:**
- EPUB reader with AI companion (uses GLM/OpenAI-compatible API)
- Knowledge Graph visualization
- Spaced repetition flashcards (SM-2 algorithm)
- Personal Reading Book generation
- 8 export formats (CSV, Markdown, Zotero, APA, MLA, Chicago, BibTeX)
- Reading streaks, daily goals, progress tracking
- Webhook support for integrations

All data stays on your server. MIT licensed.

**Setup:**
```bash
git clone https://github.com/pengjundong/read-pal
cd read-pal
cp .env.example .env  # Edit with your DB/API keys
docker compose up -d
```

Works behind nginx/reverse proxy. Full API with OpenAPI docs at `/docs`.

Would love feedback and contributions!

## IndieHackers Post

**Title:** I built read-pal — an AI reading companion that helps you actually remember what you read

**Body:**
The problem: I was reading 4-5 books a month, highlighting everything, and remembering nothing a week later.

The solution: read-pal turns passive reading into active conversation with an AI companion that knows the book, remembers your highlights, and generates a personalized "Reading Book" when you finish.

It's open source (MIT), self-hostable, and free to use. Revenue model planned: freemium with premium AI features and team book clubs.

Currently in beta — looking for early users who read seriously and want to shape the product.

Tech: Solo-built with Python/FastAPI + Next.js 14 + PostgreSQL + Redis + GLM AI.

Demo: http://175.178.66.207:8090
GitHub: https://github.com/pengjundong/read-pal
