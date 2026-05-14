import { and, eq, desc, asc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { submissions, users, votes, comments } from "../db/schema";
import type { Db } from "../db/client";
import type { PaginationParams } from "./pagination";

// Correlated subquery expressions — used in SELECT and ORDER BY
export const upvoteCountExpr = sql<number>`(SELECT CAST(COUNT(*) AS INT) FROM ${votes} WHERE ${votes.submissionId} = ${submissions.id} AND ${votes.type} = 'upvote')`;
export const commentCountExpr = sql<number>`(SELECT CAST(COUNT(*) AS INT) FROM ${comments} WHERE ${comments.submissionId} = ${submissions.id})`;

export const submissionCols = {
  id: submissions.id,
  slug: submissions.slug,
  canonicalSlug: submissions.canonicalSlug,
  type: submissions.type,
  title: submissions.title,
  body: submissions.body,
  codeBefore: submissions.codeBefore,
  codeAfter: submissions.codeAfter,
  before: submissions.before,
  after: submissions.after,
  delta: submissions.delta,
  metric: submissions.metric,
  cpu: submissions.cpu,
  simd: submissions.simd,
  language: submissions.language,
  compiler: submissions.compiler,
  tags: submissions.tags,
  sourceUrl: submissions.sourceUrl,
  supersedes: submissions.supersedes,
  supersededBy: submissions.supersededBy,
  fixFor: submissions.fixFor,
  confidence: submissions.confidence,
  rootCause: submissions.rootCause,
  affectedCpus: submissions.affectedCpus,
  detection: submissions.detection,
  status: submissions.status,
  version: submissions.version,
  isCanonical: submissions.isCanonical,
  createdAt: submissions.createdAt,
  updatedAt: submissions.updatedAt,
  authorUsername: users.username,
  authorReputation: users.reputation,
  upvotes: upvoteCountExpr,
  commentCount: commentCountExpr,
};

export type SubmissionRow = Awaited<
  ReturnType<typeof fetchSubmissions>
>["rows"][number];

export function buildOrderBy(sort?: string, dir?: string) {
  const direction = dir === "asc" ? asc : desc;
  switch (sort) {
    case "delta":   return direction(submissions.delta);
    case "upvotes": return direction(upvoteCountExpr);
    case "version": return direction(submissions.version);
    default:        return direction(submissions.createdAt);
  }
}

export async function fetchSubmissions(
  db: Db,
  where: SQL | undefined,
  pagination: PaginationParams,
  orderBy: ReturnType<typeof buildOrderBy>
) {
  const offset = (pagination.page - 1) * pagination.limit;

  const [rows, countRows] = await Promise.all([
    db
      .select(submissionCols)
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .where(where)
      .orderBy(orderBy)
      .limit(pagination.limit)
      .offset(offset),
    db
      .select({ count: sql<number>`CAST(COUNT(*) AS INT)` })
      .from(submissions)
      .innerJoin(users, eq(submissions.userId, users.id))
      .where(where),
  ]);

  return { rows, total: countRows[0]?.count ?? 0 };
}

export async function fetchOneBySlug(db: Db, slug: string, extra?: SQL) {
  const rows = await db
    .select(submissionCols)
    .from(submissions)
    .innerJoin(users, eq(submissions.userId, users.id))
    .where(extra ? and(eq(submissions.slug, slug), extra) : eq(submissions.slug, slug))
    .limit(1);

  return rows[0] ?? null;
}

// All versions in a chain, oldest first — identified by shared canonical_slug
export async function fetchVersionChain(db: Db, canonicalSlug: string) {
  return db
    .select(submissionCols)
    .from(submissions)
    .innerJoin(users, eq(submissions.userId, users.id))
    .where(
      and(
        eq(submissions.canonicalSlug, canonicalSlug),
        eq(submissions.status, "approved")
      )
    )
    .orderBy(asc(submissions.version));
}
