# read-pal Regression Test Report

**System:** read-pal - AI Reading Companion  
**Backend:** FastAPI @ http://localhost:8000  
**Frontend:** Next.js @ http://localhost:3001  
**Regression Date:** 2026-06-11  
**Original Test Date:** 2026-06-10  
**Test Account:** creazyreader@example.com  

---

## Executive Summary

This regression test was conducted after the development team reported that previously identified issues had been fixed. The original test identified **19 bugs** across 3 severity levels (3 Critical, 2 High, 7 Medium, 6 Low) plus 1 new issue discovered during browser testing.

**Regression Result: The majority of issues remain unfixed.**

| Verdict | Count | Issues |
|---------|-------|--------|
| FIXED | 3 | Health check (database status), .env.local file creation (C3 partial), dark mode media query detection (M7 partial) |
| PARTIAL | 2 | Pydantic error messages (L3), Security headers (L6) |
| NOT FIXED | 14 | C1, C2, C3-proxy, H1, H2, M1, M2, M3, M4, M5, M6, M7-class, L1, L2, L4, L5 |
| NEW | 1 | Next.js build artifact missing (axios vendor chunk), causing CSS/SSR failures |

**Overall: 3 fixed, 2 partially improved, 14 unchanged, 1 new regression.**

---

## Detailed Results by Issue

### Critical Issues (C1-C3)

#### C1: API Key Creation — STILL BROKEN

| Aspect | Before | After |
|--------|--------|-------|
| `POST /api/v1/api-keys` | 500 Internal Server Error | 500 Internal Server Error |
| `GET /api/v1/api-keys` | N/A | 200 OK (empty list) |
| `DELETE /api/v1/api-keys/{id}` | N/A | 404 Not Found (correct) |

The creation endpoint still crashes with a 500 error. Listing and deletion work correctly, indicating the table exists but the INSERT operation fails. Root cause analysis points to a database schema mismatch: the Alembic migration defines `created_at`/`updated_at` as `nullable=False` without `server_default`, while the SQLAlchemy model expects `server_default=func.now()`. If migrations were applied (not `create_all()`), the INSERT hits a NOT NULL constraint.

**Verdict: FAIL — unchanged**

---

#### C2: AI Agent Health — STILL UNHEALTHY

| Metric | Before | After | Expected |
|--------|--------|-------|----------|
| healthy | false | false | true |
| latency_ms | 5012 | 3756 | < 3000 |
| error | (timeout) | 429 rate limit from ZhiPu AI | none |

The error is now more specific: the GLM-4.7-flash model at ZhiPu AI (bigmodel.cn) returns HTTP 429 with error code 1305 ("model currently has too much traffic"). While latency decreased from 5012ms to 3756ms, it still exceeds the 3000ms threshold and the health status remains `false`. This is an external provider rate-limiting issue, not a backend code bug.

**Verdict: FAIL — slightly improved but still broken**

---

#### C3: Frontend API Proxy — PARTIALLY FIXED

| Aspect | Before | After |
|--------|--------|-------|
| `.env.local` file | Missing | Exists with correct content |
| Next.js proxy `/api/v1/health` | 404 | 404 |
| Next.js proxy `/api/v1/books/popular` | N/A | 404 |

The `.env.local` file now exists at `packages/web/.env.local` with `NEXT_PUBLIC_API_URL=http://localhost:8000`. However, the Next.js rewrite rules are still not being applied. The dev server was started before the `.env.local` file was created, so `NEXT_PUBLIC_API_URL` is undefined at config time. **The Next.js dev server needs to be restarted** for the environment variable to take effect.

Additionally, a new build issue was discovered: the Next.js server-side rendering is failing with `Cannot find module './vendor-chunks/axios@1.15.0.js'`, which crashes SSR for unauthenticated pages and prevents CSS from loading. All pages show unstyled content with 56+ console errors referencing missing CSS files.

**Verdict: PARTIAL — file created but server restart needed; new build artifact issue discovered**

---

### High Issues (H1-H2)

#### H1: Stored XSS in Books — STILL VULNERABLE

```
POST /api/v1/books with title: "<img src=x onerror=alert(1)>"
Response: 201 Created — raw HTML stored verbatim
GET /api/v1/books/{id}: returns "<img src=x onerror=alert(1)>" unsanitized
```

Raw HTML/JavaScript is accepted and stored in book titles, authors, and tags. The data is returned completely unsanitized in all GET endpoints. No input validation, HTML entity encoding, or sanitization library (e.g., bleach) is in use.

**Verdict: FAIL — unchanged, security vulnerability persists**

---

#### H2: Stored XSS in Annotations — STILL VULNERABLE

```
POST /api/v1/annotations with content: "<script>alert(\"xss\")</script>"
Response: 201 Created — raw HTML stored verbatim
GET /api/v1/annotations: returns "<script>alert(\"xss\")</script>" unsanitized
```

Both `content` and `note` fields in annotations accept and persist raw HTML/JavaScript. No sanitization is applied on input or output.

**Verdict: FAIL — unchanged, security vulnerability persists**

---

### Medium Issues (M1-M7)

#### M1: Book Stats Zero Counts — STILL BROKEN

```
GET /api/v1/books/stats
Response: {"total":6,"reading":0,"completed":0,"unread":0,"total_pages_read":1}
```

The `total` field is correct (6 books exist), but all status breakdown counts remain zero. The sum of individual status counts (0+0+0=0) does not equal total (6), confirming the SQL aggregation bug for status grouping.

**Verdict: FAIL — unchanged**

---

#### M2: Book Search `?q=` Ignored — STILL BROKEN

```
GET /api/v1/books?q=Regression → returns ALL 7 books
GET /api/v1/books?q=NONEXISTENT_XYZ → returns ALL 7 books (control)
```

The search parameter is entirely ignored. Both real and nonsense queries return the identical full book list.

**Verdict: FAIL — unchanged**

---

#### M3: Book Tag Filter `?tag=` Ignored — STILL BROKEN

```
GET /api/v1/books?tag=regression-test → returns ALL 8 books
GET /api/v1/books?tag=nonexistent-tag-xyz → returns ALL 8 books (control)
```

The tag filter parameter is entirely ignored. Only 1 of 8 books has the specified tag, but all books are returned regardless.

**Verdict: FAIL — unchanged**

---

#### M4: Active Session Conflict — STILL RETURNS 500

```
POST /api/v1/sessions/start (1st call) → 201 Created
POST /api/v1/sessions/start (same bookId, 2nd call) → 500 Internal Server Error
Expected: 409 Conflict
```

Duplicate active sessions trigger an unhandled database constraint violation that surfaces as a raw 500 error instead of a proper 409 Conflict response.

**Verdict: FAIL — unchanged**

---

#### M5: FK Violations — STILL RETURNS 500

```
POST /api/v1/annotations with bookId: "00000000-..." → 500 (expected 404)
POST /api/v1/sessions/start with bookId: "00000000-..." → 500 (expected 404)
```

Both endpoints crash with 500 when given a nonexistent book UUID. The FK constraint violation is not caught by the service layer.

**Verdict: FAIL — unchanged**

---

#### M6: Large Payloads — STILL RETURNS 500

```
POST /api/v1/annotations with 100KB content → 500 Internal Server Error
Expected: 413 Payload Too Large or 422 Unprocessable Entity
```

The server crashes on oversized request bodies instead of gracefully rejecting them with an appropriate 4xx status code. No request body size limit is configured or the limit handler is not functioning.

**Verdict: FAIL — unchanged**

---

#### M7: Dark Mode OS Preference — PARTIALLY FIXED

| Aspect | Before | After |
|--------|--------|-------|
| `matchMedia('(prefers-color-scheme: dark)').matches` | N/A | true (PASS) |
| Visual dark background | Light mode only | Dark background detected (PASS) |
| HTML `dark` class | Not applied | Not applied ("none") |
| Settings dark mode toggle | N/A | Not found on page (CSS broken) |

The CSS media query detection for `prefers-color-scheme: dark` now works correctly (the `matchMedia` API returns true, and a dark background color is detected). However, the HTML element does not receive a `dark` class, and the settings page dark mode toggle cannot be tested because CSS is not loading properly due to the Next.js build artifact issue.

**Verdict: PARTIAL — media query detection fixed, but visual toggle blocked by CSS loading issue**

---

### Low Issues (L1-L6)

#### L1: Collection Timestamps — STILL NULL

```
POST /api/v1/collections {"name":"Regression Test Collection"}
Response: {"created_at": null, "updated_at": null}
```

**Verdict: FAIL — unchanged**

---

#### L2: Seed-Sample Idempotency — STILL CREATING DUPLICATES

```
Call 1: 201 Created → UUID ab4f0a2e (Sample Book)
Call 2: 201 Created → UUID 8f839ed1 (Sample Book)
Call 3: 201 Created → UUID bae19f19 (Sample Book)
```

Each call creates a brand new "Sample Book" with a unique UUID. No deduplication check exists.

**Verdict: FAIL — unchanged**

---

#### L3: Pydantic Internals in Errors — PARTIALLY IMPROVED

```json
{
  "detail": [
    {"type": "string_type", "loc": ["body", "title"], "msg": "Input should be a valid string", "input": 123}
  ]
}
```

Error messages are now human-readable ("Input should be a valid string" vs. raw Pydantic tracebacks). However, the response still exposes Pydantic v2 internal structure (`type`, `loc` fields) and echoes back the entire request body in the `input` field, which could enable reflected XSS.

**Verdict: PARTIAL — improved messages, but structural metadata and input echo-back remain**

---

#### L4: User Profile createdAt — STILL NULL

```json
{"success": true, "data": {"id": "...", "email": "...", "name": "Creazy Reader", "createdAt": null}}
```

**Verdict: FAIL — unchanged**

---

#### L5: Server Header — STILL EXPOSED

```
server: uvicorn
```

**Verdict: FAIL — unchanged**

---

#### L6: Security Headers — PARTIALLY IMPROVED

| Header | Before | After |
|--------|--------|-------|
| X-Content-Type-Options | Missing | `nosniff` (ADDED) |
| X-Frame-Options | Missing | `DENY` (ADDED) |
| Content-Security-Policy | Missing | Missing |
| Strict-Transport-Security | Missing | Missing |
| X-XSS-Protection | Missing | Missing |
| Referrer-Policy | Missing | Missing |

Two security headers have been added, which is a measurable improvement. However, the two most critical headers for XSS mitigation (CSP) and transport security (HSTS) are still absent.

**Verdict: PARTIAL — 2 headers added, but CSP and HSTS still missing**

---

## Browser E2E Regression Results

**Tool:** Playwright 1.60.0 + Chromium Headless Shell 148.0.7778.96  
**Tests:** 43 total | 25 PASS | 4 FAIL | 14 WARN

### Key Browser Findings

**1. Next.js Build Artifact Missing (NEW ISSUE)**

The Next.js server-side rendering is failing with `Cannot find module './vendor-chunks/axios@1.15.0.js'`. This causes:
- All unauthenticated pages (landing, login, register) return HTTP 500 from SSR
- CSS files fail to load (`layout.css` references return 404)
- Login form fields are not rendered (0 inputs found on login page)
- 56+ console errors across authenticated pages referencing missing CSS

**2. API Proxy Still Broken (C3)**

Both `/api/v1/health` and `/api/v1/books/popular` return 404 through the Next.js proxy. The `.env.local` file exists but the dev server has not been restarted.

**3. Authenticated Pages Render Without CSS**

Via token injection and route interception, authenticated pages were tested:

| Page | Status | Issue |
|------|--------|-------|
| Dashboard (/en/dashboard) | Loaded | Content visible but no CSS styling, shows "Welcome back" and navigation |
| Library (/en/library) | Loaded | "My Library" header and search input visible, no books rendered, no CSS |
| Stats (/en/stats) | Loaded | "Reading Stats" header visible, no charts/data, no CSS |
| Settings (/en/settings) | Loaded | Page body is almost entirely blank, no settings sections visible |

**4. Dark Mode Media Query Detection Working (M7)**

`matchMedia('(prefers-color-scheme: dark)').matches` correctly returns `true` when dark mode is emulated. This is an improvement from the previous test.

**5. Responsive Design**

Mobile (375x812) and tablet (768x1024) viewports load without horizontal scrolling. However, form fields are not rendered on login pages due to the SSR failure.

---

## Health Check Improvement

```json
{
  "status": "ok",
  "version": "0.1.0",
  "checks": {
    "database": {"status": "ok"},
    "redis": {"status": "ok"}
  }
}
```

The health check has improved from `"degraded"` to `"ok"`. Both database and Redis are now reporting healthy. This is a positive change.

---

## Comparison Summary Table

| # | Issue | Severity | Before | After | Verdict |
|---|-------|----------|--------|-------|---------|
| C1 | API Key creation 500 | Critical | 500 | 500 | **FAIL** |
| C2 | AI Agent unhealthy | Critical | false, 5012ms | false, 3756ms | **FAIL** |
| C3 | Frontend API proxy | Critical | .env.local missing | File exists, proxy 404 | **PARTIAL** |
| H1 | XSS in books | High | Raw HTML stored | Raw HTML stored | **FAIL** |
| H2 | XSS in annotations | High | Raw HTML stored | Raw HTML stored | **FAIL** |
| M1 | Stats zero counts | Medium | All zeros | All zeros | **FAIL** |
| M2 | Search `?q=` ignored | Medium | Ignored | Ignored | **FAIL** |
| M3 | Tag filter ignored | Medium | Ignored | Ignored | **FAIL** |
| M4 | Session conflict 500 | Medium | 500 | 500 | **FAIL** |
| M5 | FK violation 500 | Medium | 500 | 500 | **FAIL** |
| M6 | Large payload 500 | Medium | 500 | 500 | **FAIL** |
| M7 | Dark mode OS pref | Medium | Not detected | Media query works | **PARTIAL** |
| L1 | Collection timestamps | Low | null | null | **FAIL** |
| L2 | Seed-sample duplicates | Low | Duplicates | Duplicates | **FAIL** |
| L3 | Pydantic internals | Low | Raw internals | Better messages | **PARTIAL** |
| L4 | User createdAt null | Low | null | null | **FAIL** |
| L5 | Server header leak | Low | uvicorn | uvicorn | **FAIL** |
| L6 | Missing sec headers | Low | None | 2 of 4 added | **PARTIAL** |
| — | Health check degraded | Info | degraded | ok | **FIXED** |
| NEW | Next.js build artifact | High | N/A | SSR crash, CSS missing | **NEW BUG** |

---

## Pass Rate Comparison

| Metric | Original Test | Regression Test |
|--------|--------------|-----------------|
| Issues found | 19 | 19 (14 unchanged + 2 partial + 3 fixed) + 1 new |
| Fully fixed | — | 3 (health check, .env.local file, dark mode media query) |
| Partially improved | — | 4 (proxy needs restart, error messages, security headers, M7 visual) |
| Still broken | — | 14 |
| New regressions | — | 1 (Next.js build artifact) |
| API pass rate | 84% | ~26% (for previously-failing tests) |
| Browser E2E pass rate | 87% (unauth) | 58% (25/43, with 14 WARN) |

---

## Prioritized Recommendations

### Immediate Actions (Blocking)

1. **Restart the Next.js dev server** — The `.env.local` file is in place but the server needs a restart to load the environment variable. This will fix the API proxy (C3) and potentially restore the login flow in the browser.

2. **Rebuild Next.js** — The missing `vendor-chunks/axios@1.15.0.js` module is causing SSR failures and CSS loading errors. Run `npm run build` or reinstall dependencies in `packages/web` to regenerate the build artifacts.

### Critical Fixes

3. **Fix API Key creation (C1)** — Verify the `api_keys` table schema. If Alembic migrations were applied, check that `created_at`/`updated_at` columns have `DEFAULT now()`. Run `\d api_keys` in psql. If missing, add an ALTER TABLE migration.

4. **Investigate AI Agent connectivity (C2)** — The ZhiPu AI GLM-4.7-flash model is returning 429 rate-limit errors. Options: (a) wait for the rate limit to reset, (b) switch to a different model endpoint, (c) add retry logic with exponential backoff, (d) adjust the health check timeout/threshold.

### Security Fixes

5. **Implement HTML sanitization (H1, H2)** — Use a library like `bleach` (Python) to sanitize all user-supplied text fields before storage. Apply to book titles, authors, tags, annotation content, notes, and chapters. This is a high-priority security fix.

6. **Add Content-Security-Policy header (L6)** — A CSP header would provide defense-in-depth against XSS even if input sanitization is bypassed.

### Bug Fixes

7. **Fix book stats SQL aggregation (M1)** — Debug the status count query in `/api/v1/books/stats`. The total is correct but individual status counts are zero.

8. **Wire search and filter parameters (M2, M3)** — The `?q=` and `?tag=` query parameters in the books list endpoint are completely ignored. Implement the filtering logic.

9. **Add exception handling for DB constraint violations (M4, M5, M6)** — Catch `IntegrityError` exceptions and translate them to proper HTTP responses: 409 for unique constraint violations, 404 for FK violations, 413 for payload size limits.

### Low Priority

10. **Fix timestamp defaults (L1, L4)** — Ensure `created_at`/`updated_at` columns have database-level defaults (`DEFAULT now()`).

11. **Make seed-sample idempotent (L2)** — Check for existing sample books before creating new ones.

12. **Remove server header (L5)** — Configure uvicorn to suppress the `server` response header.

---

## Appendix: Screenshots

| File | Description |
|------|-------------|
| `regression-11-login-page.png` | Login page — content renders but form fields missing due to SSR error |
| `regression-14-auth-dashboard.png` | Dashboard — "Welcome back" heading, navigation links, no CSS styling |
| `regression-19-auth-library.png` | Library — "My Library" header, search input, no books or CSS |
| `regression-22-auth-stats.png` | Stats — "Reading Stats" heading, no charts or data visualizations |
| `regression-25-auth-settings.png` | Settings — nearly blank, no settings sections rendered |
| `regression-31-responsive-landing-mobile.png` | Mobile landing (375x812) |
| `regression-33-responsive-login-mobile.png` | Mobile login — form fields not rendered |
| `regression-35-responsive-landing-tablet.png` | Tablet landing (768x1024) |
| `regression-37-responsive-login-tablet.png` | Tablet login — form fields not rendered |
| `regression-40-console-errors-landing.png` | Console errors on landing page |
| `regression-43-console-errors-404.png` | Console errors on 404 page |

---

*Regression report generated: 2026-06-11 by QoderWork Automated Testing*
*Conclusion: The majority of reported issues have NOT been fixed. 3 improvements detected (health check, .env.local file, dark mode media query), 2 partially improved (error messages, security headers), 14 unchanged, and 1 new regression (Next.js build artifact). A Next.js server restart and rebuild are the most urgent immediate actions needed.*
