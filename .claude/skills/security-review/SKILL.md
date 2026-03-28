---
name: security-review
description: Automatically triggered security review for code changes
trigger: When files matching src/**/*.ts, src/**/*.js, or API route files are modified
---

# Security Review Skill

## Activation
This skill is automatically invoked when code changes touch API routes, authentication, or data handling.

## Checklist
1. **Input Validation** - Are all user inputs validated and sanitized?
2. **Authentication** - Are protected routes properly guarded?
3. **Authorization** - Are role-based checks in place?
4. **Data Exposure** - Is sensitive data filtered from responses?
5. **Injection** - Are queries parameterized (SQL injection)?
6. **XSS** - Is output properly encoded?
7. **CSRF** - Are state-changing operations protected?
8. **Dependencies** - Are there known vulnerabilities in dependencies?

## Output
Report findings as: CRITICAL / HIGH / MEDIUM / LOW with specific file locations and remediation steps.
