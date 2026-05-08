import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { submissions, users, comments } from "../db/schema";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import { apiError } from "../lib/errors";
import { formatSubmission } from "../lib/formatters";
import {
  fetchSubmissions,
  fetchOneBySlug,
  fetchVersionChain,
  buildOrderBy,
} from "../lib/queries";
import { authenticate } from "../auth/middleware";
import {
  paginationQuerySchema,
  paginatedSubmissionSchema,
  paginatedCommentSchema,
  submissionSchema,
  submissionWithHistorySchema,
  errorSchema,
} from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>();

const VALID_SORTS = ["date", "delta", "upvotes", "version"] as const;
const VALID_DIRS = ["asc", "desc"] as const;
const VALID_TYPES = ["optimization", "gotcha", "snippet"] as const;

// ─── Feed ─────────────────────────────────────────────────────────────────────

const feedRoute = createRoute({
  method: "get",
  path: "/feed",
  tags: ["Submissions"],
  summary: "Latest approved canonical submissions",
  request: { query: paginationQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Paginated feed",
    },
  },
});

router.openapi(feedRoute, async (c) => {
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const where = and(eq(submissions.status, "approved"), eq(submissions.isCanonical, true));
  const { rows, total } = await fetchSubmissions(db, where, pagination, buildOrderBy());

  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

// ─── Filtered list ────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/submissions",
  tags: ["Submissions"],
  summary: "List submissions with optional filters",
  request: {
    query: paginationQuerySchema.extend({
      type: z.enum(VALID_TYPES).optional(),
      cpu: z.string().optional(),
      sort: z.enum(VALID_SORTS).optional(),
      dir: z.enum(VALID_DIRS).optional(),
      tag: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Filtered, paginated submissions",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid query params",
    },
  },
});

router.openapi(listRoute, async (c) => {
  const { type, cpu, sort, dir } = c.req.valid("query");
  const tags = c.req.queries("tag") ?? [];
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const conditions = [
    eq(submissions.status, "approved"),
    eq(submissions.isCanonical, true),
    ...(type ? [eq(submissions.type, type)] : []),
    ...(cpu  ? [eq(submissions.cpu, cpu)] : []),
    ...tags.map((tag) => sql`${tag} = ANY(${submissions.tags})`),
  ];

  const { rows, total } = await fetchSubmissions(
    db,
    and(...conditions),
    pagination,
    buildOrderBy(sort, dir)
  );

  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

// ─── Gotchas ──────────────────────────────────────────────────────────────────

const gotchasRoute = createRoute({
  method: "get",
  path: "/gotchas",
  tags: ["Submissions"],
  summary: "All approved gotchas, optionally filtered by CPU",
  request: {
    query: paginationQuerySchema.extend({
      cpu: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Paginated gotchas",
    },
  },
});

router.openapi(gotchasRoute, async (c) => {
  const { cpu } = c.req.valid("query");
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const conditions = [
    eq(submissions.status, "approved"),
    eq(submissions.isCanonical, true),
    eq(submissions.type, "gotcha"),
    ...(cpu ? [eq(submissions.cpu, cpu)] : []),
  ];

  const { rows, total } = await fetchSubmissions(
    db,
    and(...conditions),
    pagination,
    buildOrderBy()
  );

  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

// ─── Snippets ─────────────────────────────────────────────────────────────────

const snippetsRoute = createRoute({
  method: "get",
  path: "/snippets",
  tags: ["Submissions"],
  summary: "All approved snippets, optionally filtered by tag",
  request: {
    query: paginationQuerySchema.extend({
      tag: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Paginated snippets",
    },
  },
});

router.openapi(snippetsRoute, async (c) => {
  const tags = c.req.queries("tag") ?? [];
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const conditions = [
    eq(submissions.status, "approved"),
    eq(submissions.isCanonical, true),
    eq(submissions.type, "snippet"),
    ...tags.map((tag) => sql`${tag} = ANY(${submissions.tags})`),
  ];

  const { rows, total } = await fetchSubmissions(
    db,
    and(...conditions),
    pagination,
    buildOrderBy()
  );

  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

// ─── Mine (must be before :slug) ─────────────────────────────────────────────

const mineRoute = createRoute({
  method: "get",
  path: "/submissions/mine",
  tags: ["Submissions"],
  summary: "Submissions by the authenticated user (or API key)",
  security: [{ bearerAuth: [] }],
  request: { query: paginationQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Caller's submissions (all statuses)",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
  },
});

router.use("/submissions/mine", authenticate);
router.openapi(mineRoute, async (c) => {
  const user = c.get("user");
  const isApiKey = c.get("isApiKey");
  const apiKeyId = c.get("apiKeyId");
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const where = isApiKey && apiKeyId
    ? and(eq(submissions.userId, user.id), eq(submissions.apiKeyId, apiKeyId))
    : eq(submissions.userId, user.id);

  const { rows, total } = await fetchSubmissions(db, where, pagination, buildOrderBy());
  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

// ─── Single submission status ──────────────────────────────────────────────────

const statusRoute = createRoute({
  method: "get",
  path: "/submissions/:slug/status",
  tags: ["Submissions"],
  summary: "Check submission status and canonical pointer",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            slug: z.string(),
            status: z.enum(["pending", "approved", "flagged", "rejected"]),
            is_canonical: z.boolean(),
            version: z.number().int(),
            superseded_by: z.string().nullable(),
          }),
        },
      },
      description: "Submission status",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not found",
    },
  },
});

router.use("/submissions/:slug/status", authenticate);
router.openapi(statusRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const db = createDb(c.env.DATABASE_URL);
  const row = await fetchOneBySlug(db, slug);

  if (!row) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  return c.json({
    slug: row.slug,
    status: row.status,
    is_canonical: row.isCanonical,
    version: row.version,
    superseded_by: row.supersededBy,
  }, 200);
});

// ─── Comments on a submission ─────────────────────────────────────────────────

const commentsRoute = createRoute({
  method: "get",
  path: "/submissions/:slug/comments",
  tags: ["Submissions"],
  summary: "List comments on a submission",
  request: {
    params: z.object({ slug: z.string() }),
    query: paginationQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedCommentSchema } },
      description: "Paginated comments",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Submission not found",
    },
  },
});

router.openapi(commentsRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const sub = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.slug, slug), eq(submissions.status, "approved")))
    .limit(1);

  if (sub.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: comments.id,
        body: comments.body,
        upvotes: comments.upvotes,
        createdAt: comments.createdAt,
        authorUsername: users.username,
        authorReputation: users.reputation,
      })
      .from(comments)
      .innerJoin(users, eq(comments.userId, users.id))
      .where(eq(comments.submissionId, sub[0].id))
      .orderBy(comments.createdAt)
      .limit(pagination.limit)
      .offset((pagination.page - 1) * pagination.limit),
    db
      .select({ total: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(comments)
      .where(eq(comments.submissionId, sub[0].id)),
  ]);

  const formatted = rows.map((r) => ({
    id: r.id,
    body: r.body,
    upvotes: r.upvotes,
    author: { username: r.authorUsername, reputation: r.authorReputation },
    created_at: r.createdAt,
  }));

  return c.json(paginatedResponse(formatted, total, pagination), 200);
});

// ─── Single submission by slug ────────────────────────────────────────────────

const bySlugRoute = createRoute({
  method: "get",
  path: "/s/:slug",
  tags: ["Submissions"],
  summary: "Get a submission by slug",
  request: {
    params: z.object({ slug: z.string() }),
    query: z.object({ history: z.enum(["true", "false"]).optional() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: submissionWithHistorySchema } },
      description: "Submission (with optional `version_chain` when `?history=true`)",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not found",
    },
  },
});

router.openapi(bySlugRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const { history } = c.req.valid("query");
  const db = createDb(c.env.DATABASE_URL);

  const row = await fetchOneBySlug(db, slug);

  if (!row) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  const formatted = formatSubmission(row);

  if (history === "true") {
    const chain = await fetchVersionChain(db, row.canonicalSlug);
    return c.json({ ...formatted, version_chain: chain.map(formatSubmission) }, 200);
  }

  return c.json(formatted, 200);
});

export default router;
