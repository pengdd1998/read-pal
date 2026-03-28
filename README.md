# read-pal 📚⚡

> The first AI agent-based reading companion that becomes your reading friend.

[![License](https://img.shields.io/badge/license-proprietary-red)](LICENSE)
[![Claude](https://img.shields.io/badge/powered%20by-Claude-orange)](https://claude.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

## Overview

read-pal transforms reading from a solitary activity into a shared experience with intelligent AI companions. Unlike traditional reading apps, read-pal uses multi-agent AI architecture to:

- 🤖 **Four specialized AI agents** (Companion, Research, Coach, Synthesis)
- 👥 **Reading Friend system** with five unique personalities
- 🧠 **Personal knowledge graphs** that grow with you
- 💬 **Conversations with books**—bidirectional dialogue with content
- 📖 **Memory books**—beautiful compilations of your reading journeys

## Key Features

### AI Agent System

| Agent | Purpose |
|-------|---------|
| **Companion** | Real-time explanations, summaries, and answers |
| **Research** | Semantic search, fact-checking, citation management |
| **Coach** | Reading strategies, comprehension monitoring, retention |
| **Synthesis** | Cross-document analysis and knowledge integration |

### Reading Friends

Choose your reading companion's personality:

- **Sage** ⚡ - Wise, patient, asks deep questions
- **Penny** 🌟 - Enthusiastic explorer who celebrates discoveries
- **Alex** ⚔️ - Gentle challenger for friendly debate
- **Quinn** 🤫 - Quiet companion who respects your flow
- **Sam** 📚 - Focused study buddy who keeps you on track

### Memory & Knowledge

- **Timeline Journeys** - Visual timeline of your entire reading experience
- **Memory Books** - Beautiful exportable compilations (scrapbook, chat log, journal)
- **Knowledge Graphs** - Auto-constructed networks of your learning
- **Spaced Repetition** - Scientific retention optimization

## Tech Stack

### Frontend
- **Mobile:** React Native (iOS/Android)
- **Web:** Next.js + TypeScript + TailwindCSS
- **Extension:** Chrome/Safari extension

### Backend
- **API:** Node.js + Express + TypeScript
- **AI:** Claude Agent SDK (Haiku, Sonnet, Opus)
- **Database:** PostgreSQL + Redis + Pinecone + Neo4j

### Infrastructure
- **Cloud:** AWS (ECS, Lambda, RDS)
- **CDN:** CloudFront
- **Monitoring:** Datadog + Sentry

## Quick Start

```bash
# Clone the repository
git clone https://github.com/read-pal/read-pal.git
cd read-pal

# Install dependencies
pnpm install

# Setup environment variables
cp .env.example .env
# Edit .env with your configuration

# Run development environment
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## Development

### Project Structure

```
read-pal/
├── packages/
│   ├── mobile/          # React Native app
│   ├── web/             # Next.js web app
│   ├── extension/       # Browser extension
│   ├── api/             # Backend API & AI agents
│   ├── shared/          # Shared code
│   └── infra/           # Infrastructure as code
├── docs/                # Documentation
└── .claude/             # Claude Code configuration
```

### Available Commands

```bash
# Development
pnpm dev              # Start all services
pnpm dev:api          # Start API only
pnpm dev:web          # Start web only
pnpm dev:mobile       # Start mobile (requires Expo)

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report

# Building
pnpm build            # Build all packages
pnpm build:api        # Build API only
pnpm build:web        # Build web only

# Linting & Formatting
pnpm lint             # Lint all code
pnpm format           # Format all code
```

## Documentation

- [Executive Summary](./docs/executive-summary.md) - Quick overview
- [Product Plan](./docs/product-plan.md) - Full specifications
- [Expert Meeting](./docs/expert-meeting-summary.md) - Expert consultation
- [Reading Friend](./docs/reading-friend-feature.md) - Reading friend deep dive
- [API Documentation](./docs/api.md) - API reference (coming soon)
- [Contributing](./docs/contributing.md) - Contribution guidelines

## Roadmap

### Phase 1: Foundation (Months 1-3) ✅
- Basic reading interface
- Single Companion Agent
- User authentication
- Library management
- Web application beta

### Phase 2: Multi-Agent (Months 4-6) 🔄
- Research, Coach, Synthesis Agents
- Knowledge graph MVP
- Mobile apps (iOS/Android)

### Phase 3: Reading Friend (Months 7-9) 📋
- Reading Friend System with personalities
- Conversation with Books
- Memory book generation
- Browser extension

### Phase 4: Launch (Months 10-12) 📋
- Collaborative reading features
- E-reader integrations
- Public launch

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./docs/contributing.md) for guidelines.

### Areas for Contribution

- **Frontend:** React components, UI/UX improvements
- **Backend:** API endpoints, database optimizations
- **AI:** Agent capabilities, conversation design
- **Testing:** Test coverage, quality assurance
- **Documentation:** Guides, examples, API docs

## License

Proprietary - All rights reserved

## Contact

- **Website:** [read-pal.com](https://read-pal.com) (coming soon)
- **Documentation:** [docs.read-pal.com](https://docs.read-pal.com) (coming soon)
- **Twitter:** [@readpal](https://twitter.com/readpal) (coming soon)

---

**Made with ❤️ and Claude AI**

*Transforming how the world reads, one conversation at a time.*
