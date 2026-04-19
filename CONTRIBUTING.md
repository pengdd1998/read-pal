# Contributing to read-pal

Thanks for your interest in contributing! This guide will help you get started.

## Quick Start

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`cd packages/server && pytest` or `pnpm --filter @read-pal/web test`)
5. Commit with a clear message
6. Open a Pull Request

## Development Setup

See [README.md](README.md#quickstart) for full setup instructions.

```bash
# Backend
cd packages/server
uv sync
uvicorn app.main:app --reload --port 8000

# Frontend
pnpm install
pnpm --filter @read-pal/web dev
```

## Code Style

### Python (Backend)
- Follow PEP 8 with type hints on all functions
- Keep functions under 50 lines
- Single quotes for strings, 4-space indentation
- Trailing commas in multi-line structures
- Use f-strings for interpolation

### TypeScript (Frontend)
- Strict mode, no implicit `any`
- Single quotes for strings, 2-space indentation
- Named exports preferred
- Keep files under 300 lines

## Architecture

- **Routers** are thin: validate input → call service → return response
- **Services** contain business logic and database operations
- **Schemas** (Pydantic) define request/response shapes
- **Models** (SQLAlchemy) define database tables
- Never put business logic in route handlers

## Testing

- Write tests for all new features and bug fixes
- Backend: pytest with SQLite in-memory DB (auto-configured)
- Frontend: Vitest + React Testing Library
- Run tests before pushing: `cd packages/server && pytest tests/ -v`

## Pull Request Process

1. Ensure all tests pass
2. Update documentation if needed
3. Keep PRs focused — one feature or fix per PR
4. Add a clear description of what changed and why

## Areas We Need Help

- Mobile responsiveness
- Browser extension (Chrome/Firefox)
- E-reader integrations (Kindle, Kobo)
- Internationalization (i18n)
- Accessibility improvements
- Documentation and guides

## Questions?

Open an issue with the "question" label or start a discussion.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
