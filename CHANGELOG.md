# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (engineering-upgrade 2026-09-05 — full record in `docs/engineering-upgrade/`)

- **Observability**: LLM trace JSONL sink (`LLM_TRACE_JSONL_PATH`), opt-in
  prompt/output content capture for badcase replay (file-only), five minimal
  metrics endpoint `GET /api/v1/stats/llm` (success rate, p50/p95/p99 latency,
  token cost, error classes, guardrail hits), guardrail hit counters in the
  output filter (Redis day-keys + in-memory fallback).
- **Evals**: regression baseline now gates `eval_runner` (REGRESSION blocks),
  `--update-baseline` CLI, `equals`/`regex` assertions, per-entry `guards`
  annotations, L2 LLM-as-judge rubric (`app/eval/judges.py`, `--judge` on
  live eval).
- **Gates**: gitleaks secret scan workflow; i18n companion-prompt content
  pins (`test_translation_prompt_pins.py`); ops runbooks
  (`ops/observability/`), ADRs (`docs/adr/`), agent-service scaffold
  template (`templates/agent-service/`).
- **Config**: `.env.example` synced with code env reads (19 missing keys +
  root MINIO→OSS fix); `LLM_LOG_ENABLED` defaults to true; pytest config
  consolidated into `pytest.ini` as single source of truth.

### Fixed

- `drift_scan.py --mode=live` now actually diffs against
  `regression_baseline.json` as its docstring always claimed.
- Regression baseline refreshed 15→36 entries (was stale `seed_run`).
- `llm_call_traces.user_id` / `book_id` now persisted (migration 0029) —
  previously stdout-only, blocking user-scoped badcase triage;
  `http_request_id` (column added in 0018, never written) is now filled
  from the request-log contextvar, and the model class finally declares it.
- `LLM_LOG_RETENTION_DAYS` has a consumer: the trace writer prunes rows
  older than the retention window (6h check cadence; ≤0 keeps forever).
- Startup warns when `LLM_LOG_ENABLED=false` instead of silently serving
  an empty metrics endpoint.
- Removed PM2 legacy: `ecosystem.config.cjs` deleted, CLAUDE.md deployment
  notes updated to the docker-compose reality.
- Stream registry (P0.3 cancel contract) gained test coverage: 18 unit
  tests across the local registry + all five cross-worker cancel reasons,
  plus SSE cancel-propagation tests at the chunk-pump level.

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
