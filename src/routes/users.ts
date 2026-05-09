import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { z } from "@hono/zod-openapi";
import { and, eq, sql } from "drizzle-orm";
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
