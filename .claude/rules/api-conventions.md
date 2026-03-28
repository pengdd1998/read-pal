# API Conventions

## Design Principles
- Use RESTful conventions for HTTP APIs
- Version APIs explicitly (e.g., `/api/v1/`)
- Use plural nouns for resource endpoints
- Return consistent response shapes

## Request/Response
- Validate all incoming request data
- Use appropriate HTTP status codes
- Include meaningful error messages in error responses
- Support pagination for list endpoints

## Authentication & Authorization
- Use token-based authentication
- Validate permissions at the route level
- Never expose internal IDs or sensitive data in responses

## Documentation
- Document all endpoints with request/response examples
- Keep API documentation in sync with implementation
