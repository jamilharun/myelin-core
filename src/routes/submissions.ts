import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq, sql, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { submissions, users, comments, editHistory } from "../db/schema";
import { parsePagination, paginatedResponse, setPaginationHeaders } from "../lib/pagination";
import { apiError } from "../lib/errors";
import { formatSubmission, formatAgentSubmission } from "../lib/formatters";
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
  paginatedAgentSubmissionSchema,
  paginatedCommentSchema,
  submissionSchema,
  submissionWithHistorySchema,
  errorSchema,
} from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>();

const VALID_SORTS = ["date", "delta", "upvotes", "version"] as const;
const VALID_DIRS = ["asc", "desc"] as const;
const VALID_TYPES = ["optimization", "gotcha", "snippet", "fix", "benchmark", "compiler_note", "compatibility"] as const;

// ─── Feed ─────────────────────────────────────────────────────────────────────

const feedRoute = createRoute({
  method: "get",
  path: "/feed",
  tags: ["Submissions"],
  summary: "Latest approved canonical submissions",
  request: {
    query: paginationQuerySchema.extend({
      format: z.enum(["full", "agent"]).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.union([paginatedSubmissionSchema, paginatedAgentSubmissionSchema]),
        },
      },
      description: "Paginated feed. `?format=agent` returns compact records omitting prose and code fields (~60-70% smaller payload, includes gotcha-specific `root_cause`, `detection`, `affected_cpus`)",
    },
  },
});

router.openapi(feedRoute, async (c) => {
  const { format, ...paginationQuery } = c.req.valid("query");
  const pagination = parsePagination(paginationQuery);
  const db = createDb(c.env.DATABASE_URL);

  const where = and(eq(submissions.status, "approved"), eq(submissions.isCanonical, true));
  const { rows, total } = await fetchSubmissions(db, where, pagination, buildOrderBy());

  setPaginationHeaders(c, total);
  if (format === "agent") {
    return c.json(paginatedResponse(rows.map(formatAgentSubmission), total, pagination), 200);
  }
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

  setPaginationHeaders(c, total);
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

  setPaginationHeaders(c, total);
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

  setPaginationHeaders(c, total);
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

  if (!user) {
    const { error, status } = apiError("UNAUTHORIZED", "Anonymous keys cannot access personal submissions.");
    return c.json({ error }, status as 401);
  }

  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const where = eq(submissions.userId, user.id);

  const { rows, total } = await fetchSubmissions(db, where, pagination, buildOrderBy());
  setPaginationHeaders(c, total);
  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

// ─── Queue (pending submissions for caller) ───────────────────────────────────

const queueRoute = createRoute({
  method: "get",
  path: "/submissions/queue",
  tags: ["Submissions"],
  summary: "Pending submissions by the authenticated user — use to avoid resubmitting before approval",
  security: [{ bearerAuth: [] }],
  request: { query: paginationQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Caller's pending submissions",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
  },
});

router.use("/submissions/queue", authenticate);
router.openapi(queueRoute, async (c) => {
  const user = c.get("user");

  if (!user) {
    const { error, status } = apiError("UNAUTHORIZED", "Anonymous keys cannot access personal submissions.");
    return c.json({ error }, status as 401);
  }

  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const where = and(eq(submissions.userId, user.id), eq(submissions.status, "pending"));
  const { rows, total } = await fetchSubmissions(db, where, pagination, buildOrderBy());
  setPaginationHeaders(c, total);
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
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const rows = await db
    .select({
      slug: submissions.slug,
      status: submissions.status,
      isCanonical: submissions.isCanonical,
      version: submissions.version,
      supersededBy: submissions.supersededBy,
      userId: submissions.userId,
    })
    .from(submissions)
    .where(eq(submissions.slug, slug))
    .limit(1);

  const row = rows[0];

  if (!row || (row.status !== "approved" && (!user || row.userId !== user.id))) {
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

  setPaginationHeaders(c, total);
  return c.json(paginatedResponse(formatted, total, pagination), 200);
});

// ─── Edit history ─────────────────────────────────────────────────────────────

const historyRoute = createRoute({
  method: "get",
  path: "/submissions/:slug/history",
  tags: ["Submissions"],
  summary: "Edit history for a submission (owner only)",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ slug: z.string() }),
    query: paginationQuerySchema,
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(z.object({
              id: z.string(),
              snapshot: z.record(z.string(), z.unknown()),
              edited_at: z.date(),
            })),
            page: z.number().int(),
            limit: z.number().int(),
            total_pages: z.number().int(),
            total: z.number().int(),
          }),
        },
      },
      description: "Paginated edit history (newest first)",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Not the owner" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
  },
});

router.use("/submissions/:slug/history", authenticate);
router.openapi(historyRoute, async (c) => {
  const { slug } = c.req.valid("param");
  const user = c.get("user");

  if (!user) {
    const { error, status } = apiError("UNAUTHORIZED", "Anonymous keys cannot access edit history.");
    return c.json({ error }, status as 401);
  }

  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const sub = await db
    .select({ id: submissions.id, userId: submissions.userId })
    .from(submissions)
    .where(eq(submissions.slug, slug))
    .limit(1);

  if (sub.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  if (sub[0].userId !== user.id) {
    const { error, status } = apiError("FORBIDDEN", "Edit history is only visible to the submission owner.");
    return c.json({ error }, status as 403);
  }

  const offset = (pagination.page - 1) * pagination.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ id: editHistory.id, snapshot: editHistory.snapshot, createdAt: editHistory.createdAt })
      .from(editHistory)
      .where(eq(editHistory.submissionId, sub[0].id))
      .orderBy(desc(editHistory.createdAt))
      .limit(pagination.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(editHistory)
      .where(eq(editHistory.submissionId, sub[0].id)),
  ]);

  setPaginationHeaders(c, total);
  return c.json(
    paginatedResponse(
      rows.map((r) => ({ id: r.id, snapshot: r.snapshot as Record<string, unknown>, edited_at: r.createdAt })),
      total,
      pagination
    ),
    200
  );
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

  const row = await fetchOneBySlug(db, slug, eq(submissions.status, "approved"));

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
