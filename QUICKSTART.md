# Quick Start Guide - read-pal Development

## Prerequisites

- Node.js 20+
- pnpm 8+
- Docker and Docker Compose

## Initial Setup

```bash
# Clone repository
git clone <repo-url>
cd read-pal

# Install dependencies
pnpm install

# Start databases
docker-compose up -d

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Development

### Start All Services
```bash
pnpm dev
```
This starts:
- API server on http://localhost:3001
- Web app on http://localhost:3000
- Hot reload enabled

### Start Individual Services
```bash
# API only
pnpm dev:api

# Web only
pnpm dev:web
```

### Run Tests
```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage

# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration
```

### Database Management
```bash
# Migrate database
pnpm db:migrate

# Seed with test data
pnpm db:seed

# Reset database
pnpm db:reset
```

## Environment Variables

Required variables (see `.env.example`):

```env
# API
API_PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=postgresql://localhost:5432/readpal
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_URL=redis://localhost:6379

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Claude AI
ANTHROPIC_API_KEY=your-key-here

# JWT
JWT_SECRET=your-secret-here
```

## Project Structure

```
read-pal/
├── packages/
│   ├── api/          # Backend API (Node.js/Express)
│   ├── web/          # Frontend (Next.js)
│   ├── mobile/       # Mobile app (React Native)
│   ├── shared/       # Shared types and utilities
│   └── infra/        # Infrastructure code
├── docs/             # Documentation
├── .claude/          # Claude Code configuration
└── docker-compose.yml
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user
- `PATCH /api/auth/me` - Update user profile

### Books
- `GET /api/books` - Get user's library
- `GET /api/books/:id` - Get specific book
- `POST /api/books` - Upload new book
- `PATCH /api/books/:id` - Update book
- `DELETE /api/books/:id` - Delete book

### Annotations
- `GET /api/annotations` - Get user annotations
- `GET /api/annotations/:id` - Get specific annotation
- `POST /api/annotations` - Create annotation
- `PATCH /api/annotations/:id` - Update annotation
- `DELETE /api/annotations/:id` - Delete annotation

### AI Agents
- `POST /api/agents/chat` - Chat with AI agent
- `POST /api/agents/explain` - Explain concept
- `POST /api/agents/summarize` - Summarize text
- `GET /api/agents` - List available agents

## Troubleshooting

### Database Connection Issues
```bash
# Check if databases are running
docker-compose ps

# Restart databases
docker-compose restart

# View logs
docker-compose logs postgres
```

### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

### Build Errors
```bash
# Clean and rebuild
pnpm clean
pnpm build
```

## Development Workflow

1. Create a feature branch
2. Make changes
3. Run tests: `pnpm test`
4. Commit with conventional commits
5. Push and create PR

## Getting Help

- See `/docs` directory for detailed documentation
- Check `CLAUDE.md` for project guidelines
- Review `.claude/rules/` for coding standards
