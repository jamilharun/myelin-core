import { eq, like } from "drizzle-orm";

function isUsernameConflict(e: unknown): boolean {
  return e instanceof Error &&
    e.message.includes("unique") &&
    e.message.includes("username");
}
import { users } from "../db/schema";
import type { Db } from "../db/client";

interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch("https://api.github.com/user", {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "myelin-core/1.0",
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    return res.json() as Promise<GitHubUser>;
  } finally {
    clearTimeout(timeout);
  }
}

export async function upsertGitHubUser(db: Db, accessToken: string) {
  const githubUser = await fetchGitHubUser(accessToken);

  // Retry loop handles username uniqueness collisions from concurrent inserts.
  // onConflictDoUpdate on githubId makes same-user concurrent logins atomic.
  for (let attempt = 0; attempt < 5; attempt++) {
    const username = attempt === 0
      ? await resolveUsername(db, githubUser.login)
      : `${githubUser.login.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24)}-${crypto.randomUUID().slice(0, 6)}`;

    try {
      const [user] = await db
        .insert(users)
        .values({
          id: crypto.randomUUID(),
          username,
          email: githubUser.email,
          githubId: githubUser.id,
          emailVerified: true,
        })
        .onConflictDoUpdate({
          target: users.githubId,
          set: { email: githubUser.email },
        })
        .returning();

      return user;
    } catch (e: unknown) {
      if (isUsernameConflict(e)) continue;
      throw e;
    }
  }

  throw new Error("Failed to create user after multiple attempts");
}

async function resolveUsername(db: Db, base: string): Promise<string> {
  const sanitized = base.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 30) || "user";

  const existing = await db
    .select({ username: users.username })
    .from(users)
    .where(like(users.username, `${sanitized}%`));

  const taken = new Set(existing.map((r) => r.username));
  if (!taken.has(sanitized)) return sanitized;

  for (let i = 2; i <= 99; i++) {
    const candidate = `${sanitized}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${sanitized}-${crypto.randomUUID().slice(0, 6)}`;
}
