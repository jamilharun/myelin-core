import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { notifications } from "../db/schema";
import { authenticate } from "../auth/middleware";
import { apiError } from "../lib/errors";
import { parsePagination, paginatedResponse, setPaginationHeaders } from "../lib/pagination";
import { paginationQuerySchema, errorSchema } from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>();

const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(["comment", "upvote", "flag_received", "approved", "rejected"]),
  payload: z.record(z.string(), z.unknown()),
  read_at: z.date().nullable(),
  created_at: z.date(),
});

// ─── GET /notifications ───────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/notifications",
  tags: ["Notifications"],
  summary: "List notifications for the authenticated user (unread first)",
  security: [{ bearerAuth: [] }],
  request: { query: paginationQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(notificationSchema),
            page: z.number().int(),
            limit: z.number().int(),
            total_pages: z.number().int(),
            total: z.number().int(),
          }),
        },
      },
      description: "Paginated notifications, unread first",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
  },
});

router.use("/notifications", authenticate);
router.openapi(listRoute, async (c) => {
  const user = c.get("user");
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);
  const offset = (pagination.page - 1) * pagination.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      // unread (readAt IS NULL → false → 0) sorts before read (true → 1)
      .orderBy(sql`${notifications.readAt} IS NOT NULL`, notifications.createdAt)
      .limit(pagination.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(notifications)
      .where(eq(notifications.userId, user.id)),
  ]);

  setPaginationHeaders(c, total);
  return c.json(
    paginatedResponse(
      rows.map((r) => ({
        id: r.id,
        type: r.type,
        payload: r.payload as Record<string, unknown>,
        read_at: r.readAt,
        created_at: r.createdAt,
      })),
      total,
      pagination
    ),
    200
  );
});

// ─── PATCH /notifications/:id/read ───────────────────────────────────────────

const markReadRoute = createRoute({
  method: "patch",
  path: "/notifications/:id/read",
  tags: ["Notifications"],
  summary: "Mark a notification as read",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ read: z.literal(true) }) } },
      description: "Marked as read",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Notification not found" },
  },
});

router.use("/notifications/:id/read", authenticate);
router.openapi(markReadRoute, async (c) => {
  const { id } = c.req.valid("param");
  const user = c.get("user");
  const db = createDb(c.env.DATABASE_URL);

  const updated = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id)))
    .returning({ id: notifications.id });

  if (updated.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Notification not found.");
    return c.json({ error }, status as 404);
  }

  return c.json({ read: true as const }, 200);
});

export default router;
