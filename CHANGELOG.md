# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-19

### Added

**Core Reading Experience**
- EPUB reader with customizable fonts, themes (light/dark/sepia), and line height
- Chapter navigation with table of contents
- Reading progress tracking with percentage and page counts
- Keyboard shortcuts for navigation

**AI Companion**
- Real-time chat with AI reading companion (GLM-powered via LangChain)
- 5 reading friend personas (Sage, Penny, Alex, Quinn, Sam)
- Contextual explanations — highlight any text and ask about it
- Streaming responses (SSE) for real-time conversation
- RAG pipeline with conversation memory
- Genre-aware AI prompts (fiction, academic, technical, etc.)
- Circuit breaker with fallback model for LLM resilience

**Annotations & Knowledge**
- Highlights with color coding
- Notes and bookmarks
- Personal knowledge graph (NetworkX-powered) with interactive SVG visualization
- Automatic concept extraction and cross-book connections
- Annotation search and filtering

**Learning Tools**
- Spaced repetition flashcards (SM-2 / Anki-style)
- Study mode with quiz questions
- Daily reading goals and streak tracking
- Activity heatmap calendar

**Memory Books**
- 6-chapter personal reading books generated from reading data
- Cover, reading journey, highlights, notes, conversations, looking forward
- AI-enriched insights and connections

**Social & Sharing**
- Book clubs with discussions and progress tracking
- Quote cards for social sharing
- Export in CSV, Markdown, HTML, JSON, APA, MLA, Chicago, Zotero formats

**Developer Features**
- 27 API routers, 140+ REST endpoints
- OpenAPI spec auto-generated from FastAPI
- API key management for programmatic access
- Webhook support with HMAC delivery and retry logging
- Developer docs page with endpoint explorer

**Platform**
- Docker Compose deployment (PostgreSQL, Redis, FastAPI, Next.js, nginx)
- CI/CD via GitHub Actions
- Professional landing page with SEO and FAQ schema
- PWA manifest and service worker
- OpenGraph social sharing images
- Onboarding tour for new users

### Testing
- 275 backend tests (pytest)
- 24 frontend tests (vitest)
- 100% router test coverage

### Technical Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic
- AI: LangChain + GLM (Zhipu AI)
- Frontend: Next.js 14, TypeScript, TailwindCSS
- Database: PostgreSQL 16, Redis 7
- Knowledge: NetworkX graph engine

[1.0.0]: https://github.com/pengdd1998/read-pal/releases/tag/v1.0.0
