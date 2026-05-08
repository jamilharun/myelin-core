import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv } from "../types";
import { createDb } from "../db/client";
import { createSessionAdapter } from "./session";
import { validateApiKey, API_KEY_PREFIX } from "./api-key";
import { apiError } from "../lib/errors";
import type { AuthUser } from "./types";

type AuthResult = {
  user: AuthUser;
  sessionId: string | null;
  isApiKey: boolean;
  isReadonly: boolean;
  apiKeyId: string | null;
};

async function resolveAuth(token: string, databaseUrl: string): Promise<AuthResult | null> {
  const db = createDb(databaseUrl);

  if (token.startsWith(API_KEY_PREFIX)) {
    const result = await validateApiKey(db, token);
    if (!result || !result.user) return null;
    return { user: result.user, sessionId: null, isApiKey: true, isReadonly: result.isReadonly, apiKeyId: result.keyId };
  }

  const adapter = createSessionAdapter(db);
  const result = await adapter.validateToken(token);
  if (!result) return null;
  return { user: result.user, sessionId: result.session.id, isApiKey: false, isReadonly: false, apiKeyId: null };
}

function extractToken(c: Parameters<MiddlewareHandler>[0]): string | null {
  const header = c.req.header("Authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return getCookie(c, "session") ?? null;
}

export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = extractToken(c);

  if (!token) {
    const { error, status } = apiError("UNAUTHORIZED", "Authentication required.");
    return c.json({ error }, status as 401);
  }

  const result = await resolveAuth(token, c.env.DATABASE_URL);

  if (!result) {
    const { error, status } = apiError("UNAUTHORIZED", "Invalid or expired credentials.");
    return c.json({ error }, status as 401);
  }

  c.set("user", result.user);
  c.set("sessionId", result.sessionId);
  c.set("isApiKey", result.isApiKey);
  c.set("isReadonly", result.isReadonly);
  c.set("apiKeyId", result.apiKeyId);

  await next();
};

// Same as authenticate but passes through unauthenticated requests.
// Routes use c.get("user") and check for undefined.
export const optionalAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = extractToken(c);

  if (token) {
    const result = await resolveAuth(token, c.env.DATABASE_URL);
    if (result) {
      c.set("user", result.user);
      c.set("sessionId", result.sessionId);
      c.set("isApiKey", result.isApiKey);
      c.set("isReadonly", result.isReadonly);
      c.set("apiKeyId", result.apiKeyId);
    }
  }

  await next();
};
