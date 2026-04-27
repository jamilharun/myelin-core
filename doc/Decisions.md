---
tags: [myelin, decisions, product, ux, monetization]
created: 2026-04-26
---

# Myelin — Decisions

## Stack

- **Frontend** — Next.js (`myelin-ui`)
- **API** — Cloudflare Workers (`myelin-core`)
- **DB** — PostgreSQL (primary data store)
- **Cache** — Redis via Upstash (rate limiting, sessions, feed caching, balloon state)
- **Auth** — none for reads, required for writes
- **Deploy** — Cloudflare (standalone, own project)

Not assembly. Separate project entirely from Assembly Browser.

---

## Verification — Community Validated

No CI. Self-reported numbers + community validates.

```
User posts optimization + their benchmark number
          ↓
Community tries it themselves
          ↓
Comments: "verified on znver2 — got -68% not -73%"
       or "couldn't reproduce — got +2% instead"
          ↓
Upvotes/flags surface good vs bad submissions
          ↓
Trust score builds per user over time
```

**Trust signals:**

| Signal     | Meaning                                    |
| ---------- | ------------------------------------------ |
| Upvote     | "I tried it, works"                        |
| Comment    | "Got X% on CPU Y"                          |
| Flag       | "Can't reproduce / suspicious"             |
| Reputation | Earned from verified submissions over time |

**Why not CI:** expensive infrastructure, server cost per run, complex to maintain. Community validation = free, scales automatically, provides richer context (multiple CPUs, real conditions).

---

## Decided

| Question                         | Decision          | Reason                                                                                                                                                                   |
| -------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public or invite-only at launch? | **Public**        | Cold start problem is already hard — invite-only makes it harder. Open launch maximizes seeding speed.                                                                   |
| Portfolio or standalone?         | **Standalone**    | Own domain (`myelin.sh`), own repo, own brand. Too distinct in purpose and audience to live under a portfolio.                                                           |
| Auth library                     | **Lucia**         | Open source, runs in Cloudflare Workers, sessions stored in own PostgreSQL. No vendor lock-in, no pricing cliff (Clerk goes paid at 10k MAU).                            |
| Slug format                      | **Title-derived** | `simd-html-tokenizer-skip-whitespace` — human-readable URLs, SEO-friendly. Collisions resolved by appending `-2`, `-3`. Max 80 chars, truncated then suffixed if needed. |
| `/suggest` endpoint              | **Removed (V1)**  | Undefined response shape, non-trivial to implement well. Add in V2 when data volume justifies it.                                                                        |
| Learning paths                   | **V2**            | Adds design complexity with no data to curate from at launch. Build after community exists.                                                                              |

**Implications of standalone:**

- Two GitHub repos — `myelin-core` (API) + `myelin-ui` (frontend) — not in monorepo
- Own Cloudflare Workers project
- Own domain — `myelin.sh`
- Own branding separate from portfolio

---

## Product Decisions

| Question   | Decision                                                                          |
| ---------- | --------------------------------------------------------------------------------- |
| Homepage   | Feed — newest first. Curated + search added later when volume justifies           |
| DB         | PostgreSQL — better full-text search, GIN indexes, mature ecosystem               |
| Search     | Tag-only at launch — full-text added at scale                                     |
| Moderation | Just you at launch — promote high-rep users as mods later                         |
| Seeding    | Post your own Assembly Browser findings — real benchmarks, real CPU, real results |

**User discovery without knowing tags:**

```
Related submissions sidebar  → "others also viewed"
Trending tags on feed        → visible without searching
"If you liked X" suggestions → same CPU or type
(learning paths → V2)
```

**Equal upvotes and flags:**

```
Tied → goes to manual review queue
Stays hidden from feed until resolved
Owner decides — approve or remove
```

**Reputation system:**

```
Submission approved after review  → +10
Submission upvoted                → +5 per upvote
Comment upvoted                   → +2 per upvote
Submission flagged and removed    → -20
```

**Code ownership + CC BY:**

- CC BY covers the _data record_ — title, delta, tags, metadata
- Code snippets: submitter retains ownership but grants platform perpetual license to display
- If submitter deletes account — code stays, they agreed to this in ToS

**GDPR for EU users:**

```
Collect minimum: email + username only
Privacy policy page — what collected, why, how deleted
"Delete my account" button — purges personal data (email, username, session)
  → submission content stays, becomes anonymous (CC BY + ToS — user agreed upfront)
  → must be clearly stated in ToS and at account deletion confirmation
No third-party trackers
Cloudflare Workers = GDPR compliant infrastructure
```

---

## UX + Technical Decisions

**URL structure:**

```
/s/[slug]              ← single submission (shareable link)
/search?q=[text]       ← full-text search
/search/tag/[tag]      ← tag filter
/search/id/[id]        ← direct ID lookup
/u/[username]          ← user profile
```

**UI decisions:**

| Question            | Decision                                             |
| ------------------- | ---------------------------------------------------- |
| Theme               | Both dark + light mode supported                     |
| Submission form     | Code editor — not plain textarea                     |
| Syntax highlighting | User specifies language per code block in submission |
| Comments            | Page refresh — simpler, no websocket overhead        |
| Usernames           | Handles only — no real names required                |
| API versioning      | `/api/v1/` from day one                              |
| Build order         | Build Myelin before Assembly Browser Phase 1         |

**Submission editing:**

```
Edits allowed — edit history shown publicly
Edit time limit: 6 hours
Reason: low-level findings get refined over time
Edit history = transparency, prevents silent misinformation
```

**Submission deletion:**

```
Personal data    → fully deleted (GDPR compliance)
Code content     → stays on platform (CC BY + ToS)
Account deleted  → submissions become anonymous, not removed
```

---

## More Decisions

**Submission field limits (standard):**

| Field                        | Limit                              |
| ---------------------------- | ---------------------------------- |
| `title`                      | 200 chars                          |
| `body`                       | 5000 chars                         |
| `code_before` / `code_after` | 50KB each                          |
| `tags`                       | max 10 tags, each tag max 30 chars |

Validation via Zod at submission time — returns `VALIDATION_ERROR` if exceeded.

**Session / token expiry:**

```
Human sessions  → no automatic expiry — active until logout or revoked
Agent API keys  → no automatic expiry — revoked manually via DELETE /api/v1/keys/[id]
```

Same model for both: you own the session, you end it. No surprise logouts mid-workflow for agents or humans.

**Redis:** Upstash — serverless Redis with HTTP API, works natively with Cloudflare Workers. Traditional Redis can't connect from Workers edge runtime.

**Launch announcement:**

```
Seed 20-30 posts first (your own Assembly Browser findings)
Then announce:
  → r/asm
  → r/programming
  → r/rust
  → HN "Show HN"
Never launch to empty feed — kills momentum
```

**Feed ranking:** Chronological — newest first. Simple, fair, nothing to game at launch.

**Notifications — agents included:**

```
Humans        → in-app notifications
Agents (V1)   → poll GET /api/v1/notifications
Agents (V1.5) → webhook events (push alternative to polling)
  submission.approved
  submission.flagged
  submission.commented
  submission.upvoted
```

**Admin:** Simple flagged content queue page — decided. No analytics at launch.

---

## Monetization

**Core rule: never charge contributors or readers. Charge power consumers only.**

```
Contributors       → free forever (they build the value)
Casual readers     → free forever (they grow the audience)
Agents             → free forever (the differentiator — charging them kills adoption)
Commercial tools   → paid (companies building products on top of Myelin data)
Researchers        → paid (bulk dataset exports)
CPU vendors        → paid (sponsored architecture sections)
```

**Revenue tiers:**

| Tier              | Who                           | What                                   | Price       |
| ----------------- | ----------------------------- | -------------------------------------- | ----------- |
| Free              | Everyone                      | Read + write, standard limits          | $0          |
| API Pro           | Commercial tools, companies   | High-volume API pulls, webhooks, feeds | ~$19/mo     |
| Data export       | Researchers                   | Bulk benchmark dataset downloads       | ~$49/export |
| Sponsored section | CPU vendors (Intel, AMD, ARM) | Featured architecture visibility       | negotiated  |
| Ads               | Relevant advertisers only     | Sidebar, docs, learning pages          | CPM-based   |

**Ads — ethical only. Allowed:**

- CPU/hardware vendors (Intel, AMD, ARM dev programs)
- Dev tooling (profilers, compilers, JetBrains)
- Cloud/infra (Hetzner, DigitalOcean)
- Low-level programming courses/books

**Not allowed:** Google AdSense, third-party tracking pixels, anything unrelated to dev/hardware.

**Contributor perk:** ads hidden after X reputation earned.

---

## Potential Users

### Early Adopters

| Audience         | What they pull                                 | Where to find them      |
| ---------------- | ---------------------------------------------- | ----------------------- |
| Assembly devs    | SIMD patterns, instruction scheduling          | r/asm, HN, OSDev forums |
| C/Zig/Rust devs  | Compiler flags, memory layout tricks           | r/rust, ziggit.dev, HN  |
| Game engine devs | SIMD collision, draw call batching, ECS layout | r/gamedev, HandmadeDev  |

### Growth Tier

| Audience               | What they pull                             |
| ---------------------- | ------------------------------------------ |
| DB engine devs         | Index scan optimizations, SIMD comparisons |
| ML inference devs      | Kernel fusion, quantization, BLAS patterns |
| Embedded/firmware devs | Interrupt latency, flash/RAM tradeoffs     |
| HTTP server devs       | Zero-copy patterns, buffer strategies      |

### Agent Tier (unique — no other platform has this)

```
Any AI agent working on performance-critical code
      ↓
Pulls API automatically for ideas + comparisons
      ↓
Posts findings back automatically
      ↓
Grows without marketing
```

### Adoption Strategy

```
V1    → assembly + C/Zig/Rust only. Don't over-build.
Launch → manually seed 20-30 posts yourself
Week 1 → recruit from r/asm, HN, HandmadeDev forums
Month 1 → agent tier discovers clean API, starts pulling
Growth  → data depth attracts DB/ML/embedded devs
```

First 50 users = manual recruitment. After that — data quality does the work.

---

## Open Source

Both repos (`myelin-core`, `myelin-ui`) are public on GitHub under dual license.

**License model:**

```
Default → AGPL
  Anyone can use, contribute, self-host
  SaaS forks must open source their changes

Commercial → MIT (paid)
  Companies pay for MIT terms
  Can build on it without AGPL obligations
  Can keep their fork closed
```

**Why this doesn't block monetization:**
Paying users aren't buying the code — they're buying the data, network, uptime, and community. None of that is affected by the license.

**CLA requirement:**
All contributors sign a CLA before their PR is merged (CLA Assistant bot — free, automated). Required to legally re-license contributor code under MIT when selling the commercial license.

**Precedent:** MySQL, Qt, MongoDB all run this model successfully.

---

## Open Questions

All resolved.

---

## All Decisions

| Question            | Decision                                                                                               | Reason                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Name                | **Myelin** (`myelin.sh`)                                                                               | Brain metaphor — myelin speeds signals = platform speeds code                                               |
| Language support    | **Systems-only at launch** (`asm`, `c`, `zig`, `rust`, `cpp`) — expand in V2 based on community demand | Keeps content focused; diluting with all languages breaks the low-level identity                            |
| Admin dashboard     | Simple flagged queue page                                                                              | No analytics overhead at launch — keep it minimal                                                           |
| Redis / Upstash     | Free tier at launch                                                                                    | 10k commands/day sufficient for early traffic, upgrade when needed                                          |
| Pagination          | Page numbers                                                                                           | Better for agents (predictable offset), saves tokens vs infinite scroll                                     |
| Notifications       | In-app for humans — API polling V1, webhooks added V1.5                                                | Agents poll `/api/v1/notifications` in V1; webhooks added in V1.5                                           |
| Announcement timing | After build is complete and wired up                                                                   | No announcement to empty or broken platform                                                                 |
| API docs            | V1: `/docs` page on `myelin-ui` (rendered from notes). V1.5: `openapi.yaml` in `myelin-core` + Redoc   | Ship fast with what's already written; migrate to spec once API stabilizes                                  |
| Open source         | **Dual license — AGPL + commercial MIT**                                                               | AGPL = open community, prevents closed forks; commercial MIT = revenue from companies wanting closed builds |
| CLA                 | Required from all contributors — CLA Assistant bot on GitHub                                           | Needed to legally re-license contributor code under MIT when selling commercial license                     |
