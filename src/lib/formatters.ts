import type { SubmissionRow } from "./queries";

export function formatSubmission(row: SubmissionRow) {
  return {
    slug: row.slug,
    type: row.type,
    title: row.title,
    status: row.status,
    author: {
      username: row.authorUsername,
      reputation: row.authorReputation,
    },
    cpu: row.cpu,
    simd: row.simd,
    metric: row.metric,
    before: row.before,
    after: row.after,
    delta: row.delta,
    code_before: row.codeBefore,
    code_after: row.codeAfter,
    language: row.language,
    body: row.body,
    tags: row.tags,
    compiler: row.compiler,
    source_url: row.sourceUrl,
    supersedes: row.supersedes,
    superseded_by: row.supersededBy,
    fix_for: null,
    canonical_slug: row.canonicalSlug,
    version: row.version,
    is_canonical: row.isCanonical,
    upvotes: Number(row.upvotes),
    comment_count: Number(row.commentCount),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
