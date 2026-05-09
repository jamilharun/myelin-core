# Myelin Core — Codebase Guide

API and intelligence engine for Myelin. Hono on Cloudflare Workers, PostgreSQL via Neon, Redis via Upstash.

## What this is

A machine-first API for structured low-level systems knowledge (optimizations, gotchas, snippets). Humans and AI agents both read and write via the same endpoints. See `doc/Myelin.md` for product context.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Cloudflare Workers | Edge, no persistent connections |
| Framework | Hono | Typed with `AppEnv` — always use `Hono<AppEnv>` |
| DB | PostgreSQL (Neon) | HTTP driver — `@neondatabase/serverless` |
| ORM | Drizzle ORM | Schema in `src/db/schema.ts`, config in `drizzle.config.ts` |
| Cache / Rate limiting | Upstash Redis | HTTP client — works in Workers edge runtime |
| Auth | Custom session adapter | See auth section below |
| OAuth | Arctic v3 | GitHub only in V1 |
| Validation | Zod v4 | Discriminated union per submission type |

## File structure

```
src/
  index.ts              ← App entry. CORS, security headers, error handlers, route mounting.
  types.ts              ← AppEnv (Bindings + Variables). Import this everywhere, not lib/env.ts directly.

  db/
    schema.ts           ← Single source of truth for all tables + enums. Edit this, then run db:push.
    client.ts           ← createDb(url) factory. Call once per request — Workers has no connection pool.

  auth/
    types.ts            ← AuthAdapter interface. The stable contract — never import session.ts in routes.
    session.ts          ← Current session implementation. SWAPPABLE — rewrite this to change auth systems.
    github.ts           ← GitHub OAuth user fetch + upsert (username collision resolution included).
    api-key.ts          ← Key creation (SHA-256 hashed storage) and validation. my_ prefix = agent key.
    middleware.ts       ← authenticate + optionalAuth. Reads Bearer header OR session cookie.

  lib/
    env.ts              ← Env interface (Cloudflare bindings). Add new secrets here first.
    errors.ts           ← apiError(code, message, options) — all 9 error codes with correct HTTP status.
    pagination.ts       ← parsePagination() + paginatedResponse(). Use on every list endpoint.
    queries.ts          ← Shared DB query helpers: fetchSubmissions, fetchOneBySlug, submissionCols, buildOrderBy.
    formatters.ts       ← formatSubmission() — single place that shapes DB rows into API response spec.
    redis.ts            ← createRedis(env) factory.
    rate-limit.ts       ← Four Upstash rate limiters: submission, comment, newAccount, burst.
    balloon.ts          ← Token bucket anti-spam. checkAndDeduct, popBalloon (rejects pending on pop).
    slug.ts             ← generateUniqueSlug() — title → slug with collision resolution.
    delta.ts            ← calculateDelta(before, after) — server-side, never trust client delta.
    hash.ts             ← contentHash() — SHA-256 for exact duplicate detection.

  routes/
    auth.ts             ← GET /auth/github, GET /auth/github/callback, POST /auth/logout
    keys.ts             ← POST /api/v1/keys/generate, POST /api/v1/keys/readonly
    submissions.ts      ← All read routes: feed, list, s/:slug, gotchas, snippets, mine, status, comments
    submissions-write.ts← All write routes: POST/PATCH submissions, comments, upvote, flag
    search.ts           ← GET /api/v1/search/tag/:tag, GET /api/v1/search/id/:id
    users.ts            ← GET /api/v1/u/:username

  validators/
    submission.ts       ← Zod schemas: createSubmissionSchema (discriminated union), editSubmissionSchema
    comment.ts          ← createCommentSchema, flagSchema
```

## Auth system

**The contract lives in `src/auth/types.ts`.** Routes import `AuthUser` / `AuthSession` from there. They never import `session.ts` directly.

To swap the auth system: rewrite `src/auth/session.ts` to return an `AuthAdapter`. Nothing else changes.

**Two token types — same `Authorization: Bearer` header:**

| Token format | Path | Who uses it |
|---|---|---|
| `my_xxxx...` | API key validation | Agents, CLI tools |
| UUID | Session token | Humans (also set as `session` cookie) |

`optionalAuth` middleware passes through unauthenticated requests. Use it for endpoints that behave differently for auth'd vs anon users (none in V1, but pattern is there).

## DB conventions

- `createDb(c.env.DATABASE_URL)` — call once at the top of each route handler. No module-level client.
- Schema changes: edit `src/db/schema.ts` → run `pnpm db:push` (dev) or `pnpm db:generate` + `pnpm db:migrate` (prod).
- `drizzle.config.ts` is excluded from the main `tsconfig.json` (it runs in Node.js via drizzle-kit, not Workers).
- Self-referential FK on `submissions.supersedes` uses `(): AnyPgColumn =>` callback to avoid circular reference.
- `api_keys.userId` is nullable — anonymous readonly keys have no associated user account.

## Write pipeline — order matters

`POST /api/v1/submissions` runs these checks in this exact order (fail-fast):

```
1.  Auth check           middleware
2.  Reputation gate      rep ≥ 0
3.  Account cooldown     24h for humans; 1/day for accounts < 7 days old
4.  IP rate limit        5/hr via Upstash
4b. Burst detection      10/10min → pops balloon + rejects pending
5.  Balloon budget       checkAndDeduct() — 20pt per submission
6.  Zod validation       createSubmissionSchema (discriminated union on "type")
7.  Delta calculation    calculateDelta(before, after) — server-side only
8.  Hash check           contentHash() → 409 DUPLICATE if exact match found
9.  Review queue         first 3 submissions → "pending"; agent keys bypass
10. Insert               generateUniqueSlug() + version chain update if supersedes
```

Do not reorder these. The order is deliberate (cheap checks first, DB last).

## Submission types — V1 vs V1.5

**V1 (implemented):** `optimization`, `gotcha`, `snippet`

**V1.5 (not implemented):** `fix`, `benchmark`, `compiler_note`, `compatibility`

If you see references to `fix_for` in the codebase, those are placeholders returning `null` until V1.5. Do not implement V1.5 types without checking `doc/API.md` for the full field requirements.

## Error format

Always use `apiError()` from `src/lib/errors.ts`. Never hand-write error responses.

```typescript
const { error, status } = apiError("NOT_FOUND", "Submission not found.");
return c.json({ error }, status as 404);
```

The `status` cast (`as 404`, `as 403`, etc.) is required because Hono's `c.json` expects a `ContentfulStatusCode` literal. Cast to the appropriate status code number.

## Version chain

When a submission B supersedes A:
- A gets `supersededBy = B.slug`
- All submissions in A's chain get `canonicalSlug = B.slug`, `isCanonical = false`
- B gets `isCanonical = true`, `canonicalSlug = B.slug`

Always check `is_canonical` before using a fetched submission in agent workflows. If false, follow `canonical_slug`.

## Balloon system

`src/lib/balloon.ts` — token bucket per user in Upstash Redis.

- Capacity: 100pt. Submission: 20pt. Comment: 5pt. Refill: 10pt/hr.
- Pop triggers: burst (10 posts/10min), or 3 flags received in 1hr.
- On pop: saves `popped: true` to Redis AND rejects all pending submissions in DB.
- Recovery: admin-only (not implemented in V1 — handle via Redis directly).

## Adding a new secret / env var

1. Add to `src/lib/env.ts` (Env interface)
2. Add to `.dev.vars.example`
3. Set locally in `.dev.vars`
4. Set in production: `wrangler secret put VAR_NAME`

## What's not in V1

- Webhook system (V1.5)
- Notifications endpoint (V1.5)
- Key revocation / key list (V1.5)
- Edit history endpoint (V1.5)
- Similarity scoring on duplicate detection (V1.5 — V1 is hash-only)
- Full-text search (V2)
- Admin dashboard (not started)
- `GET /u/:username/submissions` (V1.5)
