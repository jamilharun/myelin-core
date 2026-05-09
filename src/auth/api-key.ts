import { eq } from "drizzle-orm";
import { users, apiKeys } from "../db/schema";
import type { Db } from "../db/client";
import type { AuthUser } from "./types";

export const API_KEY_PREFIX = "my_";

export async function createApiKey(
  db: Db,
  userId: string,
  label: string,
  isReadonly = false
): Promise<{ id: string; key: string }> {
  const id = crypto.randomUUID();
  const raw = `${API_KEY_PREFIX}${crypto.randomUUID().replace(/-/g, "")}`;
  const keyHash = await hashKey(raw);

  await db.insert(apiKeys).values({ id, userId, keyHash, label, isReadonly });
  return { id, key: raw };
}

export async function createReadonlyKey(
  db: Db,
  email: string
): Promise<{ id: string; key: string }> {
  const id = crypto.randomUUID();
  const raw = `${API_KEY_PREFIX}ro_${crypto.randomUUID().replace(/-/g, "")}`;
  const keyHash = await hashKey(raw);

  await db.insert(apiKeys).values({
    id,
    keyHash,
    label: `readonly:${email}`,
    isReadonly: true,
    readonlyEmail: email,
  });
  return { id, key: raw };
}

export async function validateApiKey(
  db: Db,
  raw: string
): Promise<{ user: AuthUser | null; isReadonly: boolean; keyId: string } | null> {
  const keyHash = await hashKey(raw);

  const rows = await db
    .select()
    .from(apiKeys)
    .leftJoin(users, eq(apiKeys.userId, users.id))
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (rows.length === 0) return null;

  const { api_keys: key, users: user } = rows[0];

  if (!user && !key.isReadonly) return null;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id));

  return {
    keyId: key.id,
    isReadonly: key.isReadonly,
    user: user
      ? {
          id: user.id,
          username: user.username,
          email: user.email,
          reputation: user.reputation,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
        }
      : null,
  };
}

async function hashKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
