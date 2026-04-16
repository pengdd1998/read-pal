# API Agent Structure - Implementation Complete

## Summary

The read-pal API implements a multi-agent AI system with real-time WebSocket streaming, semantic search, and full CRUD for books, annotations, and reading sessions.

## Actual Implementation

### Package Structure

```
packages/api/
├── src/
│   ├── agents/
│   │   ├── orchestrator/         # Multi-agent coordinator
│   │   │   └── AgentOrchestrator.ts
│   │   ├── companion/            # Reading explanations & Q&A
│   │   │   └── CompanionAgent.ts
│   │   ├── research/             # Semantic library search
│   │   │   └── ResearchAgent.ts
│   │   ├── coach/                # Reading strategies & comprehension
│   │   │   └── CoachAgent.ts
│   │   ├── synthesis/            # Cross-document analysis
│   │   │   └── SynthesisAgent.ts
│   │   ├── friend/               # Reading Friend personality system
│   │   │   └── FriendAgent.ts
│   │   └── tools/                # Shared agent tools
│   │       ├── BaseTool.ts
│   │       ├── LibrarySearchTool.ts
│   │       └── WebSearchTool.ts
│   ├── routes/
│   │   ├── agent.routes.ts       # Agent chat & history
│   │   ├── book.routes.ts        # Book CRUD & content
│   │   ├── annotation.routes.ts  # Highlights, notes, bookmarks
│   │   ├── auth.routes.ts        # Login, register, JWT
│   │   ├── reading-session.routes.ts  # Session tracking
│   │   ├── stats.routes.ts       # Dashboard statistics
│   │   ├── settings.routes.ts    # User settings
│   │   └── upload.routes.ts      # Book upload & processing
│   ├── services/
│   │   ├── llmClient.ts          # GLM/Zhipu AI integration
│   │   └── SemanticSearch.ts     # Pinecone vector search
│   ├── middleware/
│   │   └── auth.ts               # JWT authentication
│   ├── db/
│   │   └── clients.ts            # PostgreSQL & Redis
│   └── index.ts                  # Express server + WS init
└── .env.example
```

### AI Engine

The system uses **GLM (Zhipu AI)** via an OpenAI-compatible API, not Claude:
- Default model: `glm-4.7-flash`
- Configured via `GLM_API_KEY` and `GLM_BASE_URL` environment variables
- The orchestrator routes requests to the appropriate agent
- Streaming responses via WebSocket

### Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |
| GET | `/api/books` | List user's books |
| GET | `/api/upload/books/:id/content` | Get book chapters |
| PATCH | `/api/books/:id` | Update reading progress |
| POST | `/api/agents/chat` | Chat with AI agents |
| GET | `/api/agents/history` | Get chat history |
| POST | `/api/annotations` | Create annotation |
| GET | `/api/annotations` | List annotations for book |
| DELETE | `/api/annotations/:id` | Delete annotation |
| POST | `/api/reading-sessions/start` | Start reading session |
| PATCH | `/api/reading-sessions/:id/heartbeat` | Progress heartbeat |
| POST | `/api/reading-sessions/:id/end` | End reading session |
| GET | `/api/stats/dashboard` | Dashboard statistics |
| WS | `/ws/agents` | Real-time agent streaming |

### Request Flow

```
User Message
    ↓
POST /api/agents/chat (or WebSocket)
    ↓
AgentOrchestrator
    ↓
├─ Analyze request → select agents
├─ Execute agents (parallel/sequential)
│   ├─ CompanionAgent (explanations, chat)
│   ├─ ResearchAgent (library search via Pinecone)
│   ├─ CoachAgent (reading strategies)
│   ├─ SynthesisAgent (cross-document)
│   └─ FriendAgent (personality-based)
├─ Stream tokens via WebSocket
└─ Return combined response
```

### Deployment

- **API server**: port 3001, managed by PM2
- **WebSocket**: bound to same HTTP server
- **Database**: PostgreSQL for relational data, Redis for sessions/cache
- **Vector search**: Pinecone for semantic book search
- **Build**: TypeScript compiled to `dist/`

```bash
# Development
pnpm --filter @read-pal/api dev

# Production build
pnpm --filter @read-pal/api build

# Start with PM2
pm2 start dist/index.js --name read-pal-api
```

---

*Last updated: April 6, 2026*
