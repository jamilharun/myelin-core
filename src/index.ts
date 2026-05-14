import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import type { AppEnv } from "./types";
import authRoutes from "./routes/auth";
import keysRoutes from "./routes/keys";
import submissionsRoutes from "./routes/submissions";
import submissionsWriteRoutes from "./routes/submissions-write";
import searchRoutes from "./routes/search";
import usersRoutes from "./routes/users";
import notificationsRoutes from "./routes/notifications";
import webhooksRoutes from "./routes/webhooks";

const app = new OpenAPIHono<AppEnv>();

// ─── Security headers ─────────────────────────────────────────────────────────

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Authorization", "Content-Type"],
  exposeHeaders: ["X-Total-Count"],
  maxAge: 86400,
}));

app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("X-License", "CC BY 4.0 - https://creativecommons.org/licenses/by/4.0/");
});

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/", (c) => c.json({ name: "myelin-core", version: "1.0.0" }));

app.get("/robots.txt", (c) =>
  c.text(
    [
      "User-agent: *",
      "Disallow: /auth/",
      "Disallow: /api/v1/keys/",
      "Disallow: /api/v1/submissions/mine",
      "Crawl-delay: 2",
      "",
      "# Data licensed CC BY 4.0 — attribution required on reuse",
      "# High-volume access: use an API key (POST /api/v1/keys/readonly)",
    ].join("\n")
  )
);

app.route("/auth", authRoutes);
app.route("/api/v1/keys", keysRoutes);
app.route("/api/v1", submissionsRoutes);
app.route("/api/v1", submissionsWriteRoutes);
app.route("/api/v1", searchRoutes);
app.route("/api/v1", usersRoutes);
app.route("/api/v1", notificationsRoutes);
app.route("/api/v1", webhooksRoutes);

// ─── OpenAPI spec + docs ──────────────────────────────────────────────────────

app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description:
    "Pass a session token (UUID) or an agent API key (my_…) as a Bearer token. " +
    "Session tokens are returned by GET /auth/github/callback. " +
    "API keys are created via POST /api/v1/keys/generate.",
});

app.doc31("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Myelin API",
    version: "1.0.0",
    description:
      "Machine-first API for structured low-level systems knowledge. " +
      "Humans and agents read and write via the same endpoints. " +
      "Data licensed CC BY 4.0 — attribution required on reuse.",
  },
});

app.get("/docs", Scalar({ url: "/openapi.json" }));

// ─── Error handlers ───────────────────────────────────────────────────────────

app.notFound((c) =>
  c.json(
    { error: { code: "NOT_FOUND", message: `${c.req.method} ${c.req.path} is not a valid endpoint.`, status: 404 } },
    404
  )
);

app.onError((err, c) => {
  console.error(`[${c.req.method}] ${c.req.path}`, err);
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred.", status: 500 } },
    500
  );
});

export default app;
