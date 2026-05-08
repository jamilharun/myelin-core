import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { GitHub, generateState } from "arctic";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { createSessionAdapter } from "../auth/session";
import { upsertGitHubUser } from "../auth/github";
import { authenticate } from "../auth/middleware";
import { apiError } from "../lib/errors";
import { errorSchema } from "../lib/openapi-schemas";

const auth = new OpenAPIHono<AppEnv>();

// Regular route — returns a redirect, not JSON
auth.get("/github", (c) => {
  const github = buildGitHubProvider(c);
  const state = generateState();

  const url = github.createAuthorizationURL(state, ["user:email"]);

  setCookie(c, "github_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    maxAge: 600,
    path: "/",
  });

  return c.redirect(url.toString());
});

const callbackRoute = createRoute({
  method: "get",
  path: "/github/callback",
  tags: ["Auth"],
  summary: "GitHub OAuth callback — exchanges code for a session token",
  request: {
    query: z.object({
      code: z.string().optional(),
      state: z.string().optional(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ token: z.string() }),
        },
      },
      description: "Session token (also set as a `session` cookie)",
    },
    403: {
      content: { "application/json": { schema: errorSchema } },
      description: "Invalid OAuth state or failed code exchange",
    },
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["Auth"],
  summary: "Invalidate the current session",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: z.object({ success: z.literal(true) }),
        },
      },
      description: "Session invalidated",
    },
    401: {
      content: { "application/json": { schema: errorSchema } },
      description: "Not authenticated",
    },
  },
});

auth.openapi(callbackRoute, async (c) => {
  const { code, state } = c.req.valid("query");
  const storedState = getCookie(c, "github_oauth_state");

  if (!code || !state || state !== storedState) {
    const { error, status } = apiError("FORBIDDEN", "Invalid OAuth state.");
    return c.json({ error }, status as 403);
  }

  const github = buildGitHubProvider(c);

  let accessToken: string;
  try {
    const tokens = await github.validateAuthorizationCode(code);
    accessToken = tokens.accessToken();
  } catch {
    const { error, status } = apiError("FORBIDDEN", "Failed to exchange OAuth code.");
    return c.json({ error }, status as 403);
  }

  const db = createDb(c.env.DATABASE_URL);
  const user = await upsertGitHubUser(db, accessToken);

  const adapter = createSessionAdapter(db);
  const { token } = await adapter.createSession(user.id);

  deleteCookie(c, "github_oauth_state");
  setCookie(c, "session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });

  return c.json({ token }, 200);
});

auth.use("/logout", authenticate);
auth.openapi(logoutRoute, async (c) => {
  const sessionId = c.get("sessionId");

  if (sessionId) {
    const db = createDb(c.env.DATABASE_URL);
    const adapter = createSessionAdapter(db);
    await adapter.invalidateSession(sessionId);
  }

  deleteCookie(c, "session");
  return c.json({ success: true as const }, 200);
});

function buildGitHubProvider(c: { env: AppEnv["Bindings"]; req: { url: string } }) {
  const redirectUri = `${new URL(c.req.url).origin}/auth/github/callback`;
  return new GitHub(c.env.GITHUB_CLIENT_ID, c.env.GITHUB_CLIENT_SECRET, redirectUri);
}

export default auth;
