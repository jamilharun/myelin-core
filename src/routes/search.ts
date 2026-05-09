import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { submissions } from "../db/schema";
import { parsePagination, paginatedResponse } from "../lib/pagination";
import { apiError } from "../lib/errors";
import { formatSubmission } from "../lib/formatters";
import { fetchSubmissions, fetchOneBySlug, buildOrderBy } from "../lib/queries";
import {
  paginationQuerySchema,
  paginatedSubmissionSchema,
  submissionSchema,
  errorSchema,
} from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>();

const tagSearchRoute = createRoute({
  method: "get",
  path: "/search/tag/:tag",
  tags: ["Search"],
  summary: "Search submissions by tag",
  request: {
    params: z.object({ tag: z.string() }),
    query: paginationQuerySchema,
  },
  responses: {
    200: {
      content: { "application/json": { schema: paginatedSubmissionSchema } },
      description: "Submissions matching the tag",
    },
  },
});

const idSearchRoute = createRoute({
  method: "get",
  path: "/search/id/:id",
  tags: ["Search"],
  summary: "Look up a submission by internal ID",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      content: { "application/json": { schema: submissionSchema } },
      description: "Submission",
    },
    404: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not found",
    },
  },
});

router.openapi(tagSearchRoute, async (c) => {
  const { tag } = c.req.valid("param");
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);

  const where = and(
    eq(submissions.status, "approved"),
    eq(submissions.isCanonical, true),
    sql`${tag} = ANY(${submissions.tags})`
  );

  const { rows, total } = await fetchSubmissions(db, where, pagination, buildOrderBy());
  return c.json(paginatedResponse(rows.map(formatSubmission), total, pagination), 200);
});

router.openapi(idSearchRoute, async (c) => {
  const { id } = c.req.valid("param");
  const db = createDb(c.env.DATABASE_URL);

  const rows = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, id))
    .limit(1);

  if (rows.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  const row = await fetchOneBySlug(db, rows[0].slug);
  if (!row) {
    const { error, status } = apiError("NOT_FOUND", "Submission not found.");
    return c.json({ error }, status as 404);
  }

  return c.json(formatSubmission(row), 200);
});

export default router;
