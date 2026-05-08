import { like } from "drizzle-orm";
import { submissions } from "../db/schema";
import type { Db } from "../db/client";

export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function generateUniqueSlug(title: string, db: Db): Promise<string> {
  const base = titleToSlug(title);
  const existing = await db
    .select({ slug: submissions.slug })
    .from(submissions)
    .where(like(submissions.slug, `${base}%`));

  const slugSet = new Set(existing.map((r) => r.slug));
  if (!slugSet.has(base)) return base;

  for (let i = 2; i <= 9999; i++) {
    const candidate = `${base}-${i}`;
    if (!slugSet.has(candidate)) return candidate;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}
