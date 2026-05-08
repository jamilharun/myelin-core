import { eq, like } from "drizzle-orm";
import { users } from "../db/schema";
import type { Db } from "../db/client";

interface GitHubUser {
  id: number;
  login: string;
  email: string | null;
}

async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "myelin-core/1.0",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  return res.json() as Promise<GitHubUser>;
}

export async function upsertGitHubUser(db: Db, accessToken: string) {
  const githubUser = await fetchGitHubUser(accessToken);

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.githubId, githubUser.id))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const username = await resolveUsername(db, githubUser.login);
  const [newUser] = await db
    .insert(users)
    .values({
      id: crypto.randomUUID(),
      username,
      email: githubUser.email,
      githubId: githubUser.id,
      // GitHub OAuth means the email is already verified by GitHub
      emailVerified: true,
    })
    .returning();

  return newUser;
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
