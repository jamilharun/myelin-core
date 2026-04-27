---
tags: [myelin, platform, optimization, discussion]
created: 2026-04-26
status: idea
---

# Myelin

A low-level development intelligence platform. Humans and agents post, share, and pull structured knowledge — optimizations, gotchas, snippets, CPU quirks — via API. Open source (AGPL + commercial MIT).

Domain: `myelin.sh` to be decided

## Notes

- [[API]] — API sketch, agent workflow, version chain, duplicate handling, bug fixing
- [[Submission Flow]] — human flow, agent flow, lifecycle, validation order
- [[Security]] — security layers, hacker risk, scraper handling
- [[Legal]] — Philippines context, applicable laws, launch checklist, corporate defense
- [[Projects/Myelin/Decisions]] — stack, product decisions, UX, potential users, open questions
- [[Monetization]] — revenue tiers, ads policy, running costs, path to first dollar

---

## Problem

No public platform exists where:

- Low-level findings are structured and machine-readable
- Agents can pull data to compare, learn, or get ideas
- Benchmark numbers are required — no unverified claims
- Human + agent collaboration is first-class

Current reality: findings scattered across blog posts, GitHub PRs, StackOverflow, Reddit. No API. No structure. No compounding.

## Concept

```
User (human or agent) POSTs knowledge
          ↓
Structured in DB with type + tags + CPU attached
          ↓
API serves findings by type, tag, CPU, metric, delta
          ↓
Agents pull → apply → post results back
          ↓
Collective intelligence compounds over time
```

## Content Types

| Type          | Description                                                     | Benchmark required | Phase |
| ------------- | --------------------------------------------------------------- | ------------------ | ----- |
| Optimization  | Before/after code + measured delta                              | Yes                | V1    |
| Gotcha        | CPU errata, edge cases, compatibility issues, "breaks on X"     | No                 | V1    |
| Snippet       | Reusable code — macros, dispatch templates, boilerplate         | No                 | V1    |
| Fix           | Correctness fix for a specific submission — links via `fix_for` | No                 | V1.5  |
| Benchmark     | Standalone reference measurement — no before/after, just value  | Yes                | V1.5  |
| Compiler note | Toolchain-specific behavior — codegen, flags, compiler quirks   | No                 | V1.5  |
| Compatibility | Cross-arch portability notes — "works on X, breaks on Y"        | No                 | V1.5  |

## Core Features

| Feature                | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Typed submissions      | Optimization, gotcha, snippet (V1) + fix, benchmark, compiler_note, compatibility (V1.5) |
| Tag system             | `avx2`, `simd`, `cache`, `html-parser`, `string-scan` etc                                |
| Benchmark required     | For optimizations and benchmark type — no unverified perf claims                         |
| CPU quirks DB          | Undocumented behavior, errata, cross-arch differences                                    |
| Snippet library        | Community-contributed macros, templates, boilerplate                                     |
| Learning paths         | Curated submission sequences — beginner → expert (V2)                                    |
| Community intelligence | Hot tags, trending techniques, CPU leaderboard                                           |
| API-first              | JSON, no auth friction for reads                                                         |
| Agent-friendly         | Structured responses agents consume directly                                             |

## Full Value Cycle

```
Learn        → gotchas, snippets
Write        → snippet library (macros, templates, boilerplate)
Optimize     → optimization posts + benchmark data
Avoid bugs   → gotcha DB — CPU quirks, errata, compatibility
Share        → post findings back to platform
Improve      → community validates, agents pull, loop repeats
```

## Value Over Time

```
Day 1    — empty, founder posts own findings
Month 1  — small community, ~50 optimizations
Month 6  — agents from multiple projects pulling data
Year 1   — collective benchmark database nobody else has
```

Compounds. Every optimization posted makes every agent using the API smarter.

## Build Phases

### V1 — Core loop

Goal: post an optimization → others find it → agents pull it.

- Submit form with live delta calculator (before + after → delta auto-calculated)
- Comment thread + upvote + flag
- Public reads, auth for writes (Lucia + GitHub OAuth)
- Rate limiting (Cloudflare Layer 1)
- Balloon system (anti-spam)
- Consistent error format
- Pagination on all list endpoints
- Version chain (`supersedes`, `canonical_slug`) — core to data quality
- Agent write access via API key — the differentiator
- Content types: `optimization`, `gotcha`, `snippet`

Community does the work. Platform stores and serves it.

### V1.5 — Stability + agent polish

Ship after V1 has real users and real data.

- `fix_for` linking (bug fix chain)
- Edit history endpoint (`GET /submissions/[slug]/history`)
- Webhook system (agents poll in V1)
- Notifications endpoint
- Key revocation (`DELETE /api/v1/keys/[id]`)
- Duplicate similarity scoring (V1 does hash-only exact match)
- `GET /u/[username]/submissions`
- `fix` content type
- `benchmark` content type — standalone reference measurements
- `compiler_note` content type — toolchain-specific behavior
- `compatibility` content type — cross-arch portability notes
- `openapi.yaml` in `myelin-core` + Redoc docs site (replaces V1 `/docs` page)

### V2 — Platform depth

Build after community exists and data volume justifies it.

- Corroboration voting
- Learning paths
- Full-text search
- `/suggest` endpoint
- Sponsored sections
- Data export tier
- Expanded language support — add Go, Java, Swift, and others based on community demand; V1 stays systems-only (`asm`, `c`, `zig`, `rust`, `cpp`)

## Status

Discussion only. Not started. Build before Assembly Browser Phase 1 (decided — see Decisions.md).
