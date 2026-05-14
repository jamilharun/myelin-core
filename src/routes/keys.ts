import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { apiKeys } from "../db/schema";
import { createApiKey, createReadonlyKey } from "../auth/api-key";
import { authenticate } from "../auth/middleware";
import { apiError } from "../lib/errors";
import { errorSchema, validationHook } from "../lib/openapi-schemas";

const keys = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

const generateRoute = createRoute({
  method: "post",
  path: "/generate",
  tags: ["API Keys"],
  summary: "Generate a write-access API key (requires reputation ≥ 50)",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ label: z.string().min(1).max(100) }),
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            api_key: z.string(),
            label: z.string(),
          }),
        },
      },
      description: "API key created — save the key, it is only shown once",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Validation error",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Insufficient reputation or attempted key-from-key generation",
    },
  },
});

const readonlyRoute = createRoute({
  method: "post",
  path: "/readonly",
  tags: ["API Keys"],
  summary: "Generate a readonly API key (no account required)",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({ email: z.string().email() }),
        },
      },
      required: true,
    },
  },
  responses: {
    201: {
      content: {
        "application/json": {
          schema: z.object({
            id: z.string(),
            api_key: z.string(),
            rate_limit: z.string(),
            note: z.string(),
          }),
        },
      },
      description: "Readonly key created",
    },
    400: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid email",
    },
  },
});

keys.use("/generate", authenticate);
keys.openapi(generateRoute, async (c) => {
  const user = c.get("user");
  const isApiKey = c.get("isApiKey");

  if (isApiKey) {
    const { error, status } = apiError("FORBIDDEN", "API keys cannot generate other API keys.");
    return c.json({ error }, status as 403);
  }

  if (user.reputation < 50) {
    const { error, status } = apiError(
      "FORBIDDEN",
      `API write access requires reputation ≥ 50. Current: ${user.reputation}.`
    );
    return c.json({ error }, status as 403);
  }

  const { label } = c.req.valid("json");

  const db = createDb(c.env.DATABASE_URL);
  const { id, key } = await createApiKey(db, user.id, label);

  return c.json({ id, api_key: key, label }, 201);
});

keys.openapi(readonlyRoute, async (c) => {
  const { email } = c.req.valid("json");

  const db = createDb(c.env.DATABASE_URL);
  const { id, key } = await createReadonlyKey(db, email);

  return c.json(
    {
      id,
      api_key: key,
      rate_limit: "10000 GET/hr",
      note: "This key grants higher read rate limits only. No write access.",
    },
    201
  );
});

// ─── GET / — list caller's active keys ───────────────────────────────────────

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["API Keys"],
  summary: "List your API keys",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({
            data: z.array(z.object({
              id: z.string(),
              label: z.string(),
              is_readonly: z.boolean(),
              created_at: z.date(),
              last_used_at: z.date().nullable(),
            })),
          }),
        },
      },
      description: "Active API keys (keyHash never returned)",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Not allowed via API key" },
  },
});

keys.use("/", authenticate);
keys.openapi(listRoute, async (c) => {
  const user = c.get("user");
  const isApiKey = c.get("isApiKey");

  if (isApiKey) {
    const { error, status } = apiError("FORBIDDEN", "API keys cannot list other API keys.");
    return c.json({ error }, status as 403);
  }

  const db = createDb(c.env.DATABASE_URL);
  const rows = await db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      isReadonly: apiKeys.isReadonly,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))
    .orderBy(apiKeys.createdAt);

  return c.json({
    data: rows.map((r) => ({
      id: r.id,
      label: r.label,
      is_readonly: r.isReadonly,
      created_at: r.createdAt,
      last_used_at: r.lastUsedAt,
    })),
  }, 200);
});

// ─── DELETE /:id — revoke a key ───────────────────────────────────────────────

const revokeRoute = createRoute({
  method: "delete",
  path: "/:id",
  tags: ["API Keys"],
  summary: "Revoke an API key",
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: {
      content: { "application/json": { schema: z.object({ revoked: z.literal(true) }) } },
      description: "Key revoked",
    },
    401: { content: { "application/json": { schema: errorSchema } }, description: "Not authenticated" },
    403: { content: { "application/json": { schema: errorSchema } }, description: "Not allowed via API key" },
    404: { content: { "application/json": { schema: errorSchema } }, description: "Key not found or not yours" },
  },
});

keys.use("/:id", authenticate);
keys.openapi(revokeRoute, async (c) => {
  const { id } = c.req.valid("param");
  const user = c.get("user");
  const isApiKey = c.get("isApiKey");

  if (isApiKey) {
    const { error, status } = apiError("FORBIDDEN", "API keys cannot revoke other API keys.");
    return c.json({ error }, status as 403);
  }

  const db = createDb(c.env.DATABASE_URL);
  const deleted = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, user.id)))
    .returning({ id: apiKeys.id });

  if (deleted.length === 0) {
    const { error, status } = apiError("NOT_FOUND", "Key not found or does not belong to you.");
    return c.json({ error }, status as 404);
  }

  return c.json({ revoked: true as const }, 200);
});

export default keys;
