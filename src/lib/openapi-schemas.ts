import { z } from "@hono/zod-openapi";
import { apiError } from "./errors";

// ─── Pagination ───────────────────────────────────────────────────────────────

export const paginationQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

// ─── Error ────────────────────────────────────────────────────────────────────

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    status: z.number().int(),
  }),
});

// ─── Submission ───────────────────────────────────────────────────────────────

const authorSchema = z.object({
  username: z.string(),
  reputation: z.number().int(),
});

export const submissionSchema = z.object({
  slug: z.string(),
  type: z.enum(["optimization", "gotcha", "snippet"]),
  title: z.string(),
  status: z.enum(["pending", "approved", "flagged", "rejected"]),
  author: authorSchema,
  cpu: z.string().nullable(),
  simd: z.enum(["avx2", "avx512", "sse4", "neon", "sve", "rvv"]).nullable(),
  metric: z.enum(["cycles", "instructions", "ns", "ms", "rss", "throughput"]).nullable(),
  before: z.number().nullable(),
  after: z.number().nullable(),
  delta: z.number().nullable(),
  code_before: z.string().nullable(),
  code_after: z.string().nullable(),
  language: z.enum(["asm", "c", "zig", "rust", "cpp"]).nullable(),
  body: z.string().nullable(),
  tags: z.array(z.string()),
  compiler: z.enum(["gcc", "clang", "msvc", "zig-cc", "rustc", "icc"]).nullable(),
  source_url: z.string().nullable(),
  supersedes: z.string().nullable(),
  superseded_by: z.string().nullable(),
  fix_for: z.null(),
  canonical_slug: z.string(),
  version: z.number().int(),
  is_canonical: z.boolean(),
  upvotes: z.number().int(),
  comment_count: z.number().int(),
  created_at: z.date(),
  updated_at: z.date(),
});

export const submissionWithHistorySchema = submissionSchema.extend({
  version_chain: z.array(submissionSchema).optional(),
});

export const paginatedSubmissionSchema = z.object({
  data: z.array(submissionSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total_pages: z.number().int(),
  total: z.number().int(),
});

// ─── Comment ──────────────────────────────────────────────────────────────────

export const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  upvotes: z.number().int(),
  author: authorSchema,
  created_at: z.date(),
});

export const paginatedCommentSchema = z.object({
  data: z.array(commentSchema),
  page: z.number().int(),
  limit: z.number().int(),
  total_pages: z.number().int(),
  total: z.number().int(),
});

// ─── Validation hook — returns our error format instead of the default ────────

export function validationHook(
  result: { success: boolean; error?: { issues?: Array<{ message?: string }> } },
  c: { json: (data: unknown, status: number) => unknown }
) {
  if (!result.success) {
    const msg = result.error?.issues?.[0]?.message ?? "Validation error.";
    const { error, status } = apiError("VALIDATION_ERROR", msg);
    return c.json({ error }, status);
  }
}
