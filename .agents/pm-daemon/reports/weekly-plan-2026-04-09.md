# Weekly Plan: 2026-04-09 to 2026-04-16

**Prepared by:** PM Daemon (synthesized from 5 sim-users + 5 promoter agents)
**Based on:** Round 1 simulation results, consolidated advisory (2026-04-08), codebase audit

---

## 1. P1 Issue Triage: Ranked by Impact x Effort

Each issue scored on a 1-5 scale for **User Impact** (how many users hit this, how badly) and **Effort** (engineering days). **Priority = Impact / Effort** (higher = better ROI).

| # | Issue | Impact (1-5) | Effort (days) | Priority | Jamie | Sara | Alex | Dr. Chen | Mike |
|---|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| A | Knowledge/Search pages dead ends | 2 | 0.5 | 4.0 | | | x | x | |
| B | Dashboard stat overload (6 -> 3) | 2 | 0.5 | 4.0 | x | x | | | |
| C | WebSocket connects when chat never opened | 3 | 0.5 | 6.0 | | | x | | |
| D | No chapter dropdown/TOC | 5 | 1.5 | 3.3 | x | x | x | x | x |
| E | Landing page too technical | 4 | 1.0 | 4.0 | x | | | | x |
| F | Fake upload progress bar | 1 | 0.5 | 2.0 | | | x | | |
| G | No search (library or in-book) | 5 | 2.0 | 2.5 | x | x | x | x | x |
| H | Settings breaks design language | 2 | 1.0 | 2.0 | | x | x | | |
| I | No annotation editing | 3 | 1.5 | 2.0 | | x | x | x | |

### Top 5 for This Week (in execution order)

**Day 1-2 (Wed-Thu): Quick wins + critical fix**

1. **WebSocket lazy-connect** (Issue C) -- Priority 6.0
   - **What:** Move `wsClient.connect()` from mount-time in `CompanionChat` to first message send. The WS client currently opens on component mount (line 152 of CompanionChat.tsx), even if the user never opens chat. This wastes server resources and triggers O(n^2) heartbeat scaling.
   - **Fix:** Connect only when `isOpen` transitions to `true` for the first time. Disconnect on unmount.
   - **Effort:** 0.5 days
   - **Agent votes:** Alex (performance), Launch Strategist (scaling risk)

2. **Knowledge/Search dead-end pages** (Issue A) -- Priority 4.0
   - **What:** `/search` page exists and works but is orphaned (no nav link). `/knowledge` page shows empty state when no data, with no pathway back. Dashboard links to `/knowledge` but it shows "No knowledge graph yet" with no guidance.
   - **Fix:** Add search icon to global navbar. Give knowledge page a "How to build your graph" explainer instead of just empty state. Both pages need consistent design language (rounded-2xl cards, proper dark mode).
   - **Effort:** 0.5 days
   - **Agent votes:** Dr. Chen (critical for academic workflow), Alex (dead ends = abandon)

3. **Dashboard stat consolidation** (Issue B) -- Priority 4.0
   - **What:** Dashboard shows 6 stat cards (Library, Pages, Day Streak, In Progress, Concepts, Completed) which overwhelms new users. For empty-state users, there is already a "Getting Started" flow -- the 6-card grid only appears after first upload.
   - **Fix:** Consolidate to 3 hero metrics: **Books Read**, **Reading Streak**, **Pages This Week**. Move the other 3 to a "Detailed Stats" expandable section below. This reduces cognitive load for Jamie and Sara.
   - **Effort:** 0.5 days
   - **Agent votes:** Jamie (overwhelmed by numbers), Sara (wants simplicity)

**Day 3-4 (Fri-Mon): High-impact features**

4. **Chapter dropdown/TOC in reader** (Issue D) -- Priority 3.3
   - **What:** The reading page has prev/next chapter buttons but no chapter list or table of contents. Users cannot jump to a specific chapter. This is the #1 feature request across all personas. The `chapters` array is already loaded in state (ReadPage has `chapters: Chapter[]`).
   - **Fix:** Add a TOC dropdown/panel to the reading nav bar. Clicking a chapter title calls `handleChapterChange(index)`. The data is already available -- this is a pure UI task.
   - **Effort:** 1.5 days
   - **Agent votes:** ALL FIVE USERS flagged this. Dr. Chen needs it for academic navigation. Jamie needs it to not feel lost. Alex expects it as basic e-reader functionality.

5. **Landing page rewrite** (Issue E) -- Priority 4.0
   - **What:** Current landing page is agent-feature-centric (describes 4 agents, knowledge graphs, reading friends). It reads like a technical spec, not a user benefit. Jamie has no idea what "Synthesis Agent" means. The hero says "Read Smarter. Remember More. Grow Together." -- the middle promise is clear but "Grow Together" is vague.
   - **Fix:** Rewrite to benefit-first language. Lead with the transformation: "Your books just got a study buddy." Move agent details below the fold or behind a "How it works" expandable. Replace technical jargon with human outcomes. Add a prominent demo/GIF area (even if placeholder).
   - **Effort:** 1.0 days
   - **Agent votes:** Jamie (abandon risk), SEO Specialist (conversion optimization), Content Marketer (messaging)

**Not This Week (deferred)**

| Issue | Why Deferred |
|-------|-------------|
| No search (library/in-book) | 2 days effort, needs backend work. Schedule for Week 2. |
| Fake upload progress bar | Low impact (users don't notice), cosmetic. |
| Settings breaks design language | Only power users hit this, 1 day effort, can batch with other UI polish. |
| No annotation editing | Important but not a new-user blocker. Schedule for Week 2. |

---

## 2. Bold Idea: "60-Second Magic Moment"

### What: Pre-loaded Sample Book with Guided AI Conversation

**The concept:** When a new user signs up, instead of an empty library, they land on a pre-loaded public domain short story (e.g., "The Gift of the Magi" by O. Henry). After the first paragraph, the Reading Friend automatically pops in with a contextual comment: *"Did you notice how O. Henry sets up the twist in the very first sentence? Keep reading -- this gets good."*

After the user finishes the 5-minute story, the AI asks: *"Want to see what I noticed? Here are 3 things you might have missed."* -- showing highlights, cross-references, and a mini knowledge graph.

**Why this makes Jamie tell friends:**
- Zero-friction "aha moment" -- no upload, no setup, no waiting
- The AI feels genuinely intelligent because it's pre-seeded with curated insights
- It's a complete, shareable experience in under 5 minutes

**Why a tech blog would write about it:**
- "This AI reading app gave me a better experience with a 100-year-old short story than most apps give with modern content"
- Demonstrates all 4 agents in a controlled, polished way
- The knowledge graph for a single short story is a perfect demo artifact

**Why it takes < 2 days:**
- The sample book seed endpoint already exists (`/api/books/seed-sample`)
- The Getting Started section already has a "Try a sample book" button on the dashboard
- What's missing: (a) curated AI annotations for the sample book, (b) a guided onboarding overlay, (c) the "friend introduction" moment
- Estimated: 1 day for curated content + 0.5 day for onboarding flow + 0.5 day for friend intro animation

**The math:** Currently 0% of new users have a magical first experience. Even if this converts 10% of visitors to sign up, that is infinitely better than the current funnel.

---

## 3. Stop Doing

Based on agent feedback and codebase analysis, these are activities that consume time without proportional value:

### STOP: Building new pages before fixing existing ones
- Knowledge page, search page, and chat page exist but are broken or orphaned. Adding new features (mobile, browser extension) before the core web app works is premature.
- **DevRel agent:** "A broken demo is worse than no demo."

### STOP: Implementing features without the backend wired
- Semantic search uses hash-based pseudo-embeddings (returns random results)
- WebSearchTool has a mock fallback that returns fabricated URLs
- SynthesisAgent does trivial pairing, not genuine cross-referencing
- These are listed as features but do not actually work. Either fix them or remove the UI. Showing broken features erodes trust faster than showing fewer features.
- **Alex:** "I'd rather the app not have a knowledge graph than show me a fake one."

### STOP: Over-polishing UI before validating flows
- The landing page has beautiful animated gradient orbs but fails the 5-second test (what is this product?)
- The dashboard has smooth animated counters for stats that are zero for new users
- The reading page has a background ambient effect nobody asked for
- **Content Marketer:** "Polish is only valuable after the story is right."

### STOP: Planning infrastructure that serves 0 users
- Neo4j, Pinecone, Redis, AWS ECS, Kubernetes -- all in the architecture docs. Current deployment: single PM2 instance on a home server. The O(n^2) WebSocket heartbeat matters at 100 users; we have 0.
- **Launch Strategist:** "Ship to 10 users first. Scale to 10,000 later."

### STOP: Writing marketing content without a working product
- Press kits, Product Hunt listings, conference talk proposals, ambassador programs -- all designed, none executable. The Community Manager designed a 7-Day Reading Challenge that cannot be run because the app has no sharing features.
- **Community Manager:** "I cannot invite beta users to something that breaks in 2 minutes."

---

## 4. Risk Assessment

### High Risk (could block the week)

| Risk | Probability | Impact | Mitigation |
|------|:-----------:|:------:|------------|
| **GLM API instability** -- llmClient.ts has zero error handling, retry, or timeout. One API hiccup = total agent crash, blocking all AI features. | HIGH | CRITICAL | Day 1 task: add try/catch + retry + timeout to llmClient.ts. This was P0 in the advisory and is still unfixed. |
| **Sample book seed may fail silently** -- the `/api/books/seed-sample` endpoint is called but the dashboard just redirects to `/library` on success. If it fails, user sees nothing. | MEDIUM | HIGH | Add error feedback to the seed button. Pre-validate the seed data exists on server startup. |
| **Landing page rewrite scope creep** -- redesigning the landing page could easily expand from "rewrite copy" to "redesign layout" to "add animations". | MEDIUM | MEDIUM | Strict scope: text-only changes. Same layout, same components, new words. No new design elements. |

### Medium Risk (slows progress)

| Risk | Probability | Impact | Mitigation |
|------|:-----------:|:------:|------------|
| **Chapter TOC exceeds 1.5 day estimate** -- EPUB chapter parsing varies widely. Some books have nested TOC, some have no chapter markers. | MEDIUM | MEDIUM | Start with flat chapter list (already parsed). Nested TOC is v2. |
| **WebSocket lazy-connect breaks existing chat** -- changing connect timing could introduce race conditions with message sending. | LOW | HIGH | Add integration test: open chat, send message, verify WS connected first. Test on slow 3G throttle. |
| **Dark mode inconsistencies in new components** -- the codebase mixes `dark:` Tailwind variants inconsistently. New components may look broken in dark mode. | MEDIUM | LOW | Test all changes in both light and dark mode before committing. |

### External Risks

| Risk | Probability | Impact | Mitigation |
|------|:-----------:|:------:|------------|
| **Self-hosted server downtime** -- single server, no failover. If the server goes down, everything is down. | LOW | CRITICAL | No mitigation this week. Add to Week 2: health monitoring + auto-restart. |
| **GLM API pricing changes** -- Zhipu AI could change pricing or rate limits. | LOW | MEDIUM | Monitor usage. Current cost is near-zero with 0 users. |

---

## Execution Schedule

| Day | Date | Focus | Deliverables |
|-----|------|-------|-------------|
| Wed | Apr 9 | Quick wins + critical | WS lazy-connect, Knowledge/Search dead-end fixes, Dashboard consolidation |
| Thu | Apr 10 | Quick wins + start bold | Complete quick wins, start sample book guided experience |
| Fri | Apr 11 | Chapter TOC | Chapter dropdown in reader, tested with 2+ books |
| Mon | Apr 14 | Landing page | Rewrite landing page copy, benefit-first messaging |
| Tue | Apr 15 | Bold idea + polish | Complete "60-Second Magic Moment", final testing |
| Wed | Apr 16 | Ship + validate | Deploy, run Jamie simulation, collect metrics |

---

## Success Metrics for This Week

| Metric | Current | Target (Apr 16) |
|--------|---------|-----------------|
| Jamie "time to wow" | Never | < 60 seconds |
| Dead-end pages | 2 (search, knowledge) | 0 |
| WS connections per session | 1 (always on) | 0 until chat opened |
| Chapter navigation | Prev/next only | Full TOC dropdown |
| Landing page clarity (5-second test) | Confusing | Clear value prop |
| New user to first-read time | ~5 min (upload required) | < 30 sec (sample book) |

---

*Plan synthesized from: Jamie (first-timer), Sara (casual), Alex (tech), Dr. Chen (academic), Mike (social), Launch Strategist, Content Marketer, DevRel, SEO Specialist, Community Manager.*
*Next review: 2026-04-16 9:47 AM*
