import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { users, submissions } from "../db/schema";
import { apiError } from "../lib/errors";
import { fetchSubmissions, buildOrderBy } from "../lib/queries";
import { formatSubmission } from "../lib/formatters";
import { parsePagination, paginatedResponse, setPaginationHeaders } from "../lib/pagination";
import { errorSchema, paginatedSubmissionSchema, paginationQuerySchema } from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>();

// ─── User submissions (must be before /:username to avoid slug capture) ────────

const userSubmissionsRoute = createRoute({
  method: "get",
  path: "/u/:username/submissions",
  tags: ["Users"],
  summary: "All approved submissions by a user",
  request: {
    params: z.object({ username: z.string() }),
    query: paginationQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Paginated approved submissions",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "User not found",
    },
  },
});

router.openapi(userSubmissionsRoute, async (c) => {
  const { username } = c.req.valid("param");
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const userRows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (userRows.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "User not found.");
    return c.json({ error }, status as 404);
  }

  const where = and(
    eq(submissions.userId, userRows[0].id),
    eq(submissions.status, "approved"),
    eq(submissions.isCanonical, true)
  );

  const { rows, total } = await fetchSubmissions(db, where, pagination, buildOrderBy());
  setPaginationHeaders(c, total);
  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

// ─── User profile ─────────────────────────────────────────────────────────────

const userRoute = createRoute({
  method: "get",
  path: "/u/:username",
  tags: ["Users"],
  summary: "Get user profile",
  request: {
    params: z.object({ username: z.string() }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            username: z.string(),
            reputation: z.number().int(),
            submission_count: z.number().int(),
            member_since: z.string().datetime(),
          }),
        },
      },
      description: "User profile",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "User not found",
    },
  },
});

router.openapi(userRoute, async (c) => {
  const { username } = c.req.valid("param");
  const db = createDb(c.env.DATABASE_URL);

  const userRows = await db
    .select({ id: users.id, username: users.username, reputation: users.reputation, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (userRows.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "User not found.");
    return c.json({ error }, status as 404);
  }

  const user = userRows[0];

  const [{ count }] = await db
    .select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
    .from(submissions)
    .where(and(
      eq(submissions.userId, user.id),
      eq(submissions.status, "approved"),
      eq(submissions.isCanonical, true),
    ));

  return c.json({
    username: user.username,
    reputation: user.reputation,
    submission_count: Number(count),
    member_since: user.createdAt,
  }, 200);
});

export default router;
