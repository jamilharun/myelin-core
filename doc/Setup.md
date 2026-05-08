# Local Setup

Everything you need to run myelin-core from scratch.

## Prerequisites

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- A [Cloudflare account](https://cloudflare.com) (free tier is fine)
- A [Neon account](https://neon.tech) (free tier)
- An [Upstash account](https://upstash.com) (free tier)
- A GitHub OAuth App (see below)

## 1. Install dependencies

```bash
pnpm install
```

## 2. Set up Neon (PostgreSQL)

1. Create a new project at [console.neon.tech](https://console.neon.tech)
2. Create a database (name it `myelin` or anything you like)
3. Copy the **connection string** from the dashboard — it looks like:
   ```
   postgresql://username:password@ep-xxx.us-east-2.aws.neon.tech/myelin?sslmode=require
   ```

## 3. Set up Upstash (Redis)

1. Create a new Redis database at [console.upstash.com](https://console.upstash.com)
2. Copy the **REST URL** and **REST token** from the database details page

## 4. Set up GitHub OAuth App

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Fill in:
   - **Application name:** Myelin (dev)
   - **Homepage URL:** `http://localhost:8787`
   - **Authorization callback URL:** `http://localhost:8787/auth/github/callback`
3. Click "Register application"
4. Copy the **Client ID**
5. Click "Generate a new client secret" and copy it

> For production, create a separate OAuth App with your real domain as the callback URL.

## 5. Configure environment variables

Copy the example file:

```bash
cp .dev.vars.example .dev.vars
```

Fill in `.dev.vars` with your values:

```bash
DATABASE_URL=postgresql://username:password@host.neon.tech/dbname?sslmode=require
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SESSION_SECRET=any_random_32_char_string
```

> `.dev.vars` is gitignored. Never commit it.

## 6. Push the schema to Neon

```bash
pnpm db:push
```

This introspects `src/db/schema.ts` and applies it to your Neon database. For development, `db:push` is the fastest path — it syncs directly without generating migration files.

> For production deployments, use `pnpm db:generate` + `pnpm db:migrate` to get versioned migration files.

## 7. Run locally

```bash
pnpm dev
```

The API will be available at `http://localhost:8787`.

Test that it's working:

```bash
curl http://localhost:8787/
# → {"name":"myelin-core","version":"1.0.0"}

curl http://localhost:8787/api/v1/feed
# → {"data":[],"page":1,"limit":20,"total_pages":0,"total":0}
```

## 8. Test the auth flow

Visit `http://localhost:8787/auth/github` in a browser. It will redirect you through GitHub OAuth and return a session token.

## Schema changes

After editing `src/db/schema.ts`:

```bash
# Development — push directly (fastest, no migration files)
pnpm db:push

# Production — generate migration files, review them, then apply
pnpm db:generate   # creates files in ./drizzle/
pnpm db:migrate    # applies pending migrations
```

Inspect your data visually:

```bash
pnpm db:studio     # opens Drizzle Studio at https://local.drizzle.studio
```

## Deployment

```bash
# Set production secrets (run once per secret)
wrangler secret put DATABASE_URL
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put SESSION_SECRET

# Deploy
pnpm deploy
```

> Before deploying for the first time, run `pnpm db:migrate` against your production Neon database to ensure the schema is applied.

## Cloudflare dashboard setup (post-deploy)

These can't be configured in `wrangler.jsonc` — set them in the Cloudflare dashboard after deploying:

**Rate limiting** (Security → WAF → Rate Limiting Rules):

| Rule | Limit |
|---|---|
| `POST /api/v1/submissions` | 5 requests/hr per IP |
| `POST /api/v1/*/comments` | 20 requests/hr per IP |
| `GET /api/v1/*` | 1000 requests/hr per IP |

These mirror the Upstash limits in `src/lib/rate-limit.ts` and act as a first-line filter before the Worker executes, saving CPU time on bursts.
