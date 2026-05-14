import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { webhooks } from "../db/schema";
import { authenticate } from "../auth/middleware";
import { apiError } from "../lib/errors";
import { encryptWebhookSecret } from "../lib/webhook-crypto";
import { parsePagination, paginatedResponse, setPaginationHeaders } from "../lib/pagination";
import { errorSchema, paginationQuerySchema, validationHook } from "../lib/openapi-schemas";

const router = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

const WEBHOOK_EVENTS = [
  "submission.approved",
  "submission.rejected",
  "submission.flagged",
  "comment.created",
  "fix.submitted",
] as const;

const webhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
  created_at: z.date(),
});

// ─── POST /webhooks ───────────────────────────────────────────────────────────

const createRoute_ = createRoute({
  method: "post",
  path: "/webhooks",
  tags: ["Webhooks"],
  summary: "Register a webhook URL for submission events",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            url: z.string().url(),
            events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
          }),
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: webhookSchema.extend({
            secret: z.string(),
            note: z.string(),
          }),
        },
      },
      description: "Webhook registered — secret shown once, use it to verify HMAC-SHA256 signatures",
    },
    400: { content: { "application/json": { schema: errorSchema } }, description: "Validation error" },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
  },
});

router.use("/webhooks", authenticate);
router.openapi(createRoute_, async (c) => {
  const user = c.get("user");
  const { url, events } = c.req.valid("json");
  const db = createDb(c.env.DATABASE_URL);

  const secretBytes = crypto.getRandomValues(new Uint8Array(32));
  const plainSecret = Array.from(secretBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ciphertext = await encryptWebhookSecret(plainSecret, c.env.WEBHOOK_SIGNING_KEY);

  const id = crypto.randomUUID();
  const [inserted] = await db.insert(webhooks).values({
    id,
    userId: user.id,
    url,
    secret: ciphertext,
    events: events as string[],
  }).returning({ createdAt: webhooks.createdAt });

  return c.json({
    id,
    url,
    events,
    active: true,
    created_at: inserted.createdAt,
    secret: plainSecret,
    note: "Save this secret — it will not be shown again. Use it to verify HMAC-SHA256 signatures on incoming webhook payloads.",
  }, 201);
});

// ─── GET /webhooks ────────────────────────────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/webhooks",
  tags: ["Webhooks"],
  summary: "List your registered webhooks",
  security: [{ bearerAuth: [] }],
  request: { query: paginationQuerySchema },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(webhookSchema),
            page: z.number().int(),
            limit: z.number().int(),
            total_pages: z.number().int(),
            total: z.number().int(),
          }),
        },
      },
      description: "Active and inactive webhooks — secret is never returned",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
  },
});

router.openapi(listRoute, async (c) => {
  const user = c.get("user");
  const pagination = parsePagination(c.req.valid("query"));
  const db = createDb(c.env.DATABASE_URL);
  const offset = (pagination.page - 1) * pagination.limit;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: webhooks.id,
        url: webhooks.url,
        events: webhooks.events,
        active: webhooks.active,
        createdAt: webhooks.createdAt,
      })
      .from(webhooks)
      .where(eq(webhooks.userId, user.id))
      .orderBy(webhooks.createdAt)
      .limit(pagination.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(webhooks)
      .where(eq(webhooks.userId, user.id)),
  ]);

  setPaginationHeaders(c, total);
  return c.json(
    paginatedResponse(
      rows.map((r) => ({ id: r.id, url: r.url, events: r.events, active: r.active, created_at: r.createdAt })),
      total,
      pagination
    ),
    200
  );
});

export default router;
