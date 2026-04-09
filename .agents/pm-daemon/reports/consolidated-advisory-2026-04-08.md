# PM Advisory — Consolidated Report
**Date:** 2026-04-08
**Source:** 10-agent PM daemon (5 user simulations + 5 promotion agents)

---

## Executive Summary

read-pal has a **strong product engine** (multi-agent AI, reading UI, annotations) wrapped in a **near-empty go-to-market shell**. Every score clusters around 30-35%: the tech works, but nobody can discover it, onboard onto it, or share from it.

**Overall Project Health: 33/100**

---

## TOP 5 CRITICAL FIXES (This Week)

### 1. Fix `/upload` broken link (30 min)
LibraryGrid.tsx links to `/upload` which doesn't exist. Every new user hits this dead end.
**File:** `packages/web/src/components/library/LibraryGrid.tsx` line 124

### 2. Fix XSS vulnerability (1 hour)
`/chat` page uses `dangerouslySetInnerHTML` without DOMPurify. Other pages sanitize correctly.
**File:** `packages/web/src/app/chat/page.tsx` line 247

### 3. Add error handling to llmClient.ts (2 hours)
No try/catch, no retry, no timeout. Every agent depends on it. One API error = total crash.
**File:** `packages/api/src/services/llmClient.ts`

### 4. Pre-load sample book for new users (4 hours)
After signup, users see empty dashboard "Welcome back, Reader" with zero books. Pre-load a public domain classic so users hit the "aha moment" in 60 seconds.

### 5. Fix fake social proof on landing page (30 min)
"Trusted by readers at Stanford, MIT, Google, Amazon, Harvard" is plain text — not real. Remove or replace with genuine beta testimonials once available.
**File:** `packages/web/src/app/page.tsx` lines 234-239

---

## HIGH PRIORITY (Next 2 Weeks)

### Product
- [ ] Add "Share highlight" and "Export annotations" features (confirmed by Sara, Mike, Dr. Chen)
- [ ] Build onboarding flow: guided first-read experience
- [ ] Fix "Welcome back, Reader" copy for first-time users
- [ ] Add auth middleware for route protection
- [ ] Make AI chat suggestions context-aware (fiction vs non-fiction vs academic)

### Technical
- [ ] Wire up LLM streaming (WS infrastructure exists but llmClient doesn't stream)
- [ ] Replace hash-based pseudo-embeddings with real embeddings (GLM has embedding models)
- [ ] Fix SynthesisAgent trivial cross-referencing logic
- [ ] Fix WebSearchTool mock fallback that returns fabricated URLs
- [ ] Add per-page SEO metadata (all pages inherit generic title)
- [ ] Add Open Graph tags, sitemap.ts, JSON-LD structured data

### Marketing/Community
- [ ] Create Discord server (structure provided by Community Manager agent)
- [ ] Set up Twitter/X and LinkedIn accounts
- [ ] Write first blog post using Content Marketer's outline
- [ ] Create demo GIF for README (DevRel agent's #1 recommendation)
- [ ] Add README badges, LICENSE file, issue/PR templates

---

## SCORE CARD (Agent Reports)

| Category | Score | Source |
|----------|-------|--------|
| First-time user experience | HIGH abandon risk | Jamie |
| Casual reader satisfaction | 6/10 | Sara |
| Social/sharing features | 4/10 | Mike |
| Academic research capability | 4/10 | Dr. Chen |
| Technical performance | 5/10 | Alex |
| SEO optimization | 32/100 | SEO Specialist |
| GitHub/developer presence | 32/100 | DevRel |
| Launch readiness | 31/100 | Launch Strategist |

---

## KEY ARCHITECTURAL ISSUES (from Alex + Dr. Chen)

1. **llmClient.ts**: Zero error handling, retry, or timeout. P0 for all agents.
2. **Hash-based embeddings**: SemanticSearch falls back to pseudo-embeddings when no OpenAI key. Core differentiator doesn't actually work semantically.
3. **No LLM streaming wired**: WebSocket infrastructure exists but llmClient uses blocking calls.
4. **XSS in /chat page**: dangerouslySetInnerHTML without DOMPurify.
5. **SynthesisAgent**: Cross-referencing is trivial pairing, not genuine analysis.
6. **WebSearchTool**: Mock fallback returns fabricated URLs — integrity issue.
7. **In-memory conversation state**: Lost on server restart.
8. **O(n²) WebSocket heartbeat**: Won't scale past ~100 users.

---

## GO-TO-MARKET READINESS

| Item | Status | Owner Agent |
|------|--------|------------|
| Discord server structure | Designed, ready to create | Community |
| 7-Day Reading Challenge | Fully planned | Community |
| Ambassador program (3 tiers) | Designed | Community |
| Beta feedback survey (10 Qs) | Designed | Community |
| Product Hunt listing | Complete draft | Launch |
| Press kit | Checklist created, none done | Launch |
| 12-week launch timeline | Designed (target: Jul 1) | Launch |
| Launch day runbook | Hour-by-hour plan | Launch |
| Blog post outline | "5-Agent Reading Companion in TS" | DevRel |
| 2 conference talk proposals | Ready to submit | DevRel |
| SEO meta content | All pages drafted | SEO |
| Social media content | Pending (rate limited) | Content |

---

## AGENT SCHEDULE (Recurring)

| Time | Day | Agent |
|------|-----|-------|
| 9:47 AM | Mon-Fri | PM Morning Standup |
| 10:17 AM | Mon-Fri | Jamie: first-time user test |
| 10:33 AM | Mon-Fri | Sara: casual reader test |
| 11:03 AM | Mon-Wed | Dr. Chen: academic test |
| 11:03 AM | Thu-Fri | Alex: tech performance test |
| 2:47 PM | Monday | Content Marketing |
| 2:47 PM | Tuesday | SEO & Discovery |
| 2:47 PM | Wednesday | Community Management |
| 2:47 PM | Thursday | Developer Relations |
| 2:47 PM | Friday | Launch Strategy |

---

*Report generated by PM Daemon. Next scheduled run: tomorrow 9:47 AM.*
*All agent personas at: .agents/pm-daemon/sim-users/ and .agents/pm-daemon/promoters/*
