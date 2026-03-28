# Code Style Rules

## General
- Use consistent naming conventions (camelCase for JS/TS, snake_case for Python)
- Keep functions under 50 lines
- Limit files to 300 lines; split larger files into modules
- Use early returns to reduce nesting

## Formatting
- Use 2-space indentation (TypeScript/JavaScript)
- Use single quotes for strings unless double quotes are needed
- Add trailing commas in multi-line structures
- Use template literals for string interpolation

## Imports
- Group imports: external packages first, then internal modules
- Remove unused imports
- Use absolute paths or configured aliases over relative paths

## Error Handling
- Use typed errors with meaningful messages
- Handle errors at the appropriate level
- Log errors with context for debugging
