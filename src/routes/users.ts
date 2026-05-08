import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { users, submissions } from "../db/schema";
import { apiError } from "../lib/errors";
import { errorSchema } from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>();

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

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      reputation: users.reputation,
      createdAt: users.createdAt,
      submissionCount: sql<number>`(
        SELECT CAST(COUNT(*) AS INT) FROM ${submissions}
        WHERE ${submissions.userId} = ${users.id}
          AND ${submissions.status} = 'approved'
          AND ${submissions.isCanonical} = true
      )`,
    })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  if (rows.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "User not found.");
    return c.json({ error }, status as 404);
  }

  const user = rows[0];
  return c.json({
    username: user.username,
    reputation: user.reputation,
    submission_count: Number(user.submissionCount),
    member_since: user.createdAt,
  }, 200);
});

export default router;
