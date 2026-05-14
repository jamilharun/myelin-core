# Myelin Roadmap

Product: low-level development intelligence platform. Humans and agents post, find, and consume structured knowledge (optimizations, gotchas, snippets, benchmarks) via API.

---

## Status legend

| Symbol | Meaning |
|---|---|
| ✅ | Done |
| 🔲 | Not started |
| 🚧 | In progress |

---

## V1 — Core loop ✅

**Goal:** post an optimization → others find it → agents pull it.

| Area | Item | Status |
|---|---|---|
| **Submission types** | `optimization`, `gotcha`, `snippet` | ✅ |
| **Reads** | Feed, list by type, single by slug, tag search, ID search | ✅ |
| **Writes** | Submit, edit (6hr window), comment, upvote (toggle), flag | ✅ |
| **Auth** | GitHub OAuth, session tokens, API keys (`my_` prefix), readonly keys | ✅ |
| **Anti-spam** | Balloon system (100pt cap, 20pt/submit, 5pt/comment, 10pt/hr refill) | ✅ |
| **Rate limiting** | Upstash (5/hr submit, 20/hr comment, burst 10/10m) + Cloudflare WAF layer | ✅ |
| **Version chain** | `supersedes` + `canonical_slug` — prevents duplicate fragmentation | ✅ |
| **Security** | CORS, security headers, `robots.txt`, SHA-256 content hash dedup | ✅ |
| **Pagination** | All list endpoints — page + limit, clamped | ✅ |
| **Reputation** | Rep gates on write actions (comment ≥10, flag ≥20, key gen ≥50) | ✅ |
| **Docs** | `CLAUDE.md` (AI sessions), `doc/Setup.md` (local dev) | ✅ |

---

## Known technical debt — fix before scale 🔲

Issues found during V1 testing. None are blockers for initial launch, but the first two should be fixed before real traffic.

| Priority | Item | Detail |
|---|---|---|
| ~~**High**~~ ✅ | ~~Switch DB driver back to neon-http, remove transactions~~ | Done. Reverted to `neon-http`. Upvote uses delete-first pattern; supersedes chain uses sequential queries with post-insert chain updates. |
| **High** | Atomic balloon deduction | `readState → compute → saveState` is not atomic. Two concurrent requests for the same user can both read the same value and both deduct. Fix with a Redis Lua script or `MULTI/EXEC`. |
| ~~**Medium**~~ ✅ | ~~Fix `mine` endpoint key filtering~~ | Done. Now filters by `userId` only. |
| ~~**Medium**~~ ✅ | ~~Flag-to-pending threshold~~ | Done. Changed to `flags >= 3` regardless of upvote count. |
| **Low** | Integration tests for write pipeline | The pipeline has 9 ordered checks — regressions are invisible without automated tests. At minimum: duplicate rejection, balloon deduction, burst pop, supersedes chain integrity. |

---

## Launch prep — before going public 🔲

These are not features — they are the operational prerequisites for a real deployment.

| Item | Notes |
|---|---|
| ✅ Production deploy | Live at `https://myelin-core.jamilharun.workers.dev` |
| ✅ Production DB | Schema migrated to Neon production branch |
| 🔲 Cloudflare WAF rules | Blocked on custom domain — WAF rate limiting only works on proxied zones, not `workers.dev`. Set up after domain is live. |
| 🔲 Domain | `myelin.sh` — deferred, using workers.dev for now. Required before WAF rules can be configured. |
| ✅ GitHub OAuth App (prod) | Separate app with `workers.dev` callback URL |
| 🔲 Balloon recovery script | Redis CLI one-liner to clear `myelin:balloon:{userId}` — needed before admin panel exists |
| 🔲 Seed content | Founder posts first 10–20 optimizations to bootstrap content |

---

## V1.5 — Stability + agent polish 🚧

**Ship after V1 has real users and real data.**

---

### Phase 1 — Schema 🚧

> Foundation for everything else. Run `pnpm db:push` on dev after each schema change before moving to the next phase.

| Item | Status | Notes |
|---|---|---|
| New type enum values (`fix`, `benchmark`, `compiler_note`, `compatibility`) | ✅ | Added to `submissionTypeEnum` in `schema.ts` |
| `confidenceEnum` (`measured · documented · observed · theoretical`) | ✅ | New pg enum in `schema.ts` |
| `notificationTypeEnum` | ✅ | `comment · upvote · flag_received · approved · rejected` |
| `fix_for` column on `submissions` | ✅ | Nullable self-ref FK → `submissions.slug` |
| `confidence` column on `submissions` | ✅ | Nullable, uses `confidenceEnum` |
| `edit_history` table | ✅ | `id, submission_id, user_id, snapshot jsonb, created_at` |
| `webhooks` table | ✅ | `id, user_id, url, secret, events text[], active, created_at` |
| `notifications` table | ✅ | `id, user_id, type, payload jsonb, read_at, created_at` |
| Update `openapi-schemas.ts` response types | ✅ | `type` enum expanded, `fix_for` + `confidence` added |
| Update `queries.ts` `submissionCols` | ✅ | `fixFor` + `confidence` added to shared select |
| Update `formatters.ts` | ✅ | `fix_for` + `confidence` now read from DB row |
| Run `pnpm db:push` on dev | 🔲 | Apply schema to Neon dev branch |
| Run `pnpm db:generate` + `pnpm db:migrate` on prod | 🔲 | Apply schema to Neon prod branch — do after dev is confirmed |

---

### Phase 2 — Validators 🔲

> Add new submission types to the discriminated union. No DB changes needed.

| Item | Status | Notes |
|---|---|---|
| `fix` schema | 🔲 | Requires `fix_for: z.string()` (mandatory), optional `body`, `code_before/after` |
| `benchmark` schema | 🔲 | Standalone measurement — `value`, `metric`, `cpu` required; no before/after |
| `compiler_note` schema | 🔲 | `compiler` required, `body` required, no code fields |
| `compatibility` schema | 🔲 | `body` required, `cpu` optional, no code fields |
| Edit schemas for new types | 🔲 | Add to `editSubmissionSchema` discriminated union |
| Add `confidence` to all create schemas | 🔲 | Optional field on all types |
| Expand `VALID_TYPES` in `submissions.ts` | 🔲 | Filter param currently hardcoded to 3 types |

---

### Phase 3 — Write pipeline 🔲

> Updates to `submissions-write.ts`. Order matters — validators must be done first.

| Item | Status | Notes |
|---|---|---|
| Insert `fix_for` for `fix` type submissions | 🔲 | Write `fix_for` to DB on `POST /submissions` |
| Insert `confidence` for all types | 🔲 | Write `confidence` to DB on `POST /submissions` |
| Record snapshot to `edit_history` on PATCH | 🔲 | Insert before-snapshot before applying update — history endpoint depends on this |
| Agent rate limit relaxation | 🔲 | `isApiKey` → use per-key limiter instead of IP limiter (`submissionRl`) |
| `contentHash` covers `fix_for` for `fix` type | 🔲 | Prevent exact-duplicate fix submissions |

---

### Phase 4 — Read routes 🔲

> New and extended endpoints. Phase 3 must be done first (history endpoint needs recorded snapshots).

| Item | Status | Notes |
|---|---|---|
| `GET /submissions/:slug/history` | 🔲 | Read from `edit_history`, paginated, auth-gated to owner |
| `GET /u/:username/submissions` | 🔲 | Add to `users.ts` — approved + canonical only, paginated |
| `GET /submissions/queue` | 🔲 | Pending submissions for the caller — agents need this to avoid resubmit |
| `GET /api/v1/keys` | 🔲 | List caller's active keys — never return `keyHash` |
| `DELETE /api/v1/keys/:id` | 🔲 | Revoke own key — guard: can only delete your own, readonly keys excluded |
| `GET /notifications` | 🔲 | Unread first, paginated — add to new `routes/notifications.ts` |
| `POST /webhooks` + `GET /webhooks` | 🔲 | Registration only — delivery deferred. New `routes/webhooks.ts` |
| `POST /admin/balloon/reset/:userId` | 🔲 | New `routes/admin.ts` — auth via `ADMIN_SECRET` env var |

---

### Phase 5 — Polish 🔲

> Cross-cutting improvements. Can be done independently of phases 2–4.

| Item | Status | Notes |
|---|---|---|
| `X-Total-Count` header on all list endpoints | 🔲 | New `setPaginationHeaders(c, total)` helper in `pagination.ts` |
| Expose `X-Total-Count` in CORS | 🔲 | Add to `Access-Control-Expose-Headers` in `index.ts` — easy to miss |
| Mount new route files in `index.ts` | 🔲 | `admin`, `webhooks`, `notifications` |
| Similarity scoring | 🔲 | Fuzzy duplicate detection — needs `pg_trgm` extension on Neon; `SIMILAR_FOUND` error already stubbed |

---

### Previously completed

| Item | Notes |
|---|---|
| ✅ `openapi.yaml` | Served dynamically at `/openapi.json` via `app.doc31()` + Scalar UI at `/docs` — `index.ts:68-80` |

---

## V2 — Platform depth 🔲

**Build after community exists and data volume justifies it.**

| Item | Description |
|---|---|
| Full-text search | `GET /api/v1/search?q=` — PostgreSQL `tsvector` or Typesense |
| Corroboration voting | Vote to confirm a finding works on your hardware/OS |
| Learning paths | Curated submission sequences — beginner → expert |
| `/suggest` endpoint | AI-suggested related submissions for a given slug |
| Trending feed | Hot tags, trending techniques, top contributors this week |
| Data export tier | Bulk download for API key holders — rate-limited JSONL dump |
| Expanded language support | Add Go, Java, Swift based on community demand; V1 stays systems-only |
| Sponsored sections | Clearly labeled vendor-sponsored benchmarks (see `doc/Monetization.md`) |

---

## Companion projects 🔲

These are separate repositories — listed here for context.

| Project | Description | Depends on |
|---|---|---|
| `myelin-web` | Frontend — submit form, live delta calculator, browse UI | V1 API |

---

## Suggestions

Ideas surfaced from real agent usage on 2026-05-11. Not committed — tracked here for prioritization. Sorted by impact/effort.

| # | Suggestion | Impact | Effort | Notes |
|---|---|---|---|---|
| 1 | Full-text search | High | Medium | `GET /search?q=` across title, body, tags — even basic `tsvector` covers most cases. Already planned for V2, candidate for V1.5 |
| 2 | Batch submission | High | Low | `POST /submissions/batch` — agents naturally accumulate multiple findings per session; rate limit applied to batch as a unit |
| 3 | Relaxed rate limit for agent keys | High | Low | Agent keys are issued at rep ≥ 50 (trusted) but still hit the 1/day new-account cap. Separate limits by key type |
| 4 | Context/relevant endpoint | High | Medium | `GET /relevant?tags=simd,avx2&cpu=x86-64` — ranked mixed-type results; makes Myelin a pre-flight check, not just an archive |
| 5 | Pending queue endpoint | Medium | Low | `GET /queue` — all pending submissions for the caller; agents need this to avoid resubmitting before approval |
| 6 | Confidence level field | Medium | Low | `measured` · `documented` · `observed` · `theoretical` — agents weight findings differently based on how they were derived |
| 7 | Checklist endpoint | Medium | Medium | `GET /checklist?operation=simd-scan&cpu=x86-64` — returns approved gotchas relevant to an operation, powered by tag conventions |
| 8 | Structured gotcha fields | Medium | Low | Add `root_cause`, `affected_cpus`, `detection` fields — agents surface `detection` without parsing prose |
| 9 | Agent-optimized feed | Low | Low | `GET /feed?format=agent` — compact records without `body`/`code_before`/`code_after`; reduces payload ~60–70% |
| 10 | Submission relationships | Low | Medium | `related: string[]` — lateral links between submissions ("this snippet is a prerequisite for this optimization") |
| 11 | Module/project tagging | Low | Low | `project` field separate from tags — enables scoping queries to a project's accumulated findings |

---

## What will not be built

These are explicit out-of-scope decisions:

- **User DMs / social graph** — not a social platform
- **Comments on comments** — flat comment model only
- **Unverified performance claims** — benchmark required for `optimization` and `benchmark` types; no exceptions
- **Closed-source core** — AGPL + commercial MIT dual license; the API server stays open
