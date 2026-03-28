# Testing Rules

## Philosophy
- Write tests for all new features and bug fixes
- Tests should be deterministic and not depend on external services
- Use descriptive test names that explain the expected behavior

## Structure
- Follow the Arrange-Act-Assert pattern
- Each test should verify one behavior
- Use setup/teardown for shared state

## Coverage
- Aim for meaningful coverage, not just percentage targets
- Test edge cases and error paths
- Include integration tests for critical flows

## Running Tests
- All tests must pass before merging
- Run the full test suite after significant changes
- Use watch mode during development for fast feedback
