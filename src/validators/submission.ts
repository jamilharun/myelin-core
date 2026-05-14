import { z } from "zod";

const METRIC = ["cycles", "instructions", "ns", "ms", "rss", "throughput"] as const;
const SIMD = ["avx2", "avx512", "sse4", "neon", "sve", "rvv"] as const;
const LANGUAGE = ["asm", "c", "zig", "rust", "cpp"] as const;
const COMPILER = ["gcc", "clang", "msvc", "zig-cc", "rustc", "icc"] as const;
const CONFIDENCE = ["measured", "documented", "observed", "theoretical"] as const;
const MAX_CODE = 50 * 1024;

const sourceUrl = z
  .string()
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, "Invalid URL")
  .optional();

const confidence = z.enum(CONFIDENCE).optional();

// ─── V1 types ────────────────────────────────────────────────────────────────

const optimizationSchema = z.object({
  type: z.literal("optimization"),
  title: z.string().trim().min(1).max(200),
  cpu: z.string().trim().min(1),
  metric: z.enum(METRIC),
  before: z.number().positive(),
  after: z.number().positive(),
  code_before: z.string().trim().min(1).max(MAX_CODE),
  code_after: z.string().trim().min(1).max(MAX_CODE),
  language: z.enum(LANGUAGE),
  body: z.string().trim().max(5000).optional(),
  simd: z.enum(SIMD).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  supersedes: z.string().optional(),
  confidence,
});

const gotchaSchema = z.object({
  type: z.literal("gotcha"),
  title: z.string().trim().min(1).max(200),
  cpu: z.string().trim().min(1),
  body: z.string().trim().min(1).max(5000),
  code_before: z.string().trim().max(MAX_CODE).optional(),
  code_after: z.string().trim().max(MAX_CODE).optional(),
  simd: z.enum(SIMD).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  confidence,
  root_cause: z.string().trim().max(2000).optional(),
  affected_cpus: z.array(z.string().trim().max(50)).max(20).optional(),
  detection: z.string().trim().max(2000).optional(),
});

const snippetSchema = z.object({
  type: z.literal("snippet"),
  title: z.string().trim().min(1).max(200),
  code_after: z.string().trim().min(1).max(MAX_CODE),
  language: z.enum(LANGUAGE),
  body: z.string().trim().max(5000).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  confidence,
});

// ─── V1.5 types ───────────────────────────────────────────────────────────────

const fixSchema = z.object({
  type: z.literal("fix"),
  title: z.string().trim().min(1).max(200),
  // slug of the submission this corrects — enforced by DB ck_fix_for_consistency
  fix_for: z.string().trim().min(1),
  body: z.string().trim().min(1).max(5000),
  code_before: z.string().trim().max(MAX_CODE).optional(),
  code_after: z.string().trim().max(MAX_CODE).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  confidence,
});

// `value` is a single standalone measurement — stored in the `after` column, `before` stays null
const benchmarkSchema = z.object({
  type: z.literal("benchmark"),
  title: z.string().trim().min(1).max(200),
  cpu: z.string().trim().min(1),
  metric: z.enum(METRIC),
  value: z.number().positive(),
  language: z.enum(LANGUAGE).optional(),
  body: z.string().trim().max(5000).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  confidence,
});

const compilerNoteSchema = z.object({
  type: z.literal("compiler_note"),
  title: z.string().trim().min(1).max(200),
  compiler: z.enum(COMPILER),
  body: z.string().trim().min(1).max(5000),
  language: z.enum(LANGUAGE).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  confidence,
});

const compatibilitySchema = z.object({
  type: z.literal("compatibility"),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  cpu: z.string().trim().min(1).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  confidence,
});

// ─── Exports ──────────────────────────────────────────────────────────────────

export const createSubmissionSchema = z.discriminatedUnion("type", [
  optimizationSchema,
  gotchaSchema,
  snippetSchema,
  fixSchema,
  benchmarkSchema,
  compilerNoteSchema,
  compatibilitySchema,
]);

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

const editBase = {
  title: z.string().trim().min(1).max(200).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  confidence,
};

export const editSubmissionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("optimization"),
    ...editBase,
    body: z.string().trim().max(5000).optional(),
    before: z.number().positive().optional(),
    after: z.number().positive().optional(),
    metric: z.enum(METRIC).optional(),
    cpu: z.string().trim().min(1).optional(),
    code_before: z.string().trim().min(1).max(MAX_CODE).optional(),
    code_after: z.string().trim().min(1).max(MAX_CODE).optional(),
  }),
  z.object({
    type: z.literal("gotcha"),
    ...editBase,
    body: z.string().trim().min(1).max(5000).optional(),
    cpu: z.string().trim().min(1).optional(),
    code_before: z.string().trim().max(MAX_CODE).optional(),
    code_after: z.string().trim().max(MAX_CODE).optional(),
    root_cause: z.string().trim().max(2000).optional(),
    affected_cpus: z.array(z.string().trim().max(50)).max(20).optional(),
    detection: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal("snippet"),
    ...editBase,
    body: z.string().trim().max(5000).optional(),
    code_after: z.string().trim().min(1).max(MAX_CODE).optional(),
  }),
  z.object({
    type: z.literal("fix"),
    ...editBase,
    body: z.string().trim().min(1).max(5000).optional(),
    code_before: z.string().trim().max(MAX_CODE).optional(),
    code_after: z.string().trim().max(MAX_CODE).optional(),
  }),
  z.object({
    type: z.literal("benchmark"),
    ...editBase,
    value: z.number().positive().optional(),
    body: z.string().trim().max(5000).optional(),
    cpu: z.string().trim().min(1).optional(),
  }),
  z.object({
    type: z.literal("compiler_note"),
    ...editBase,
    body: z.string().trim().min(1).max(5000).optional(),
  }),
  z.object({
    type: z.literal("compatibility"),
    ...editBase,
    body: z.string().trim().min(1).max(5000).optional(),
    cpu: z.string().trim().min(1).optional(),
  }),
]);

export type EditSubmissionInput = z.infer<typeof editSubmissionSchema>;
