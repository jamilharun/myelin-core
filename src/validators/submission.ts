import { z } from "zod";

const METRIC = ["cycles", "instructions", "ns", "ms", "rss", "throughput"] as const;
const SIMD = ["avx2", "avx512", "sse4", "neon", "sve", "rvv"] as const;
const LANGUAGE = ["asm", "c", "zig", "rust", "cpp"] as const;
const MAX_CODE = 50 * 1024;

const sourceUrl = z
  .string()
  .refine((v) => { try { new URL(v); return true; } catch { return false; } }, "Invalid URL")
  .optional();

const optimizationSchema = z.object({
  type: z.literal("optimization"),
  title: z.string().min(1).max(200),
  cpu: z.string().min(1),
  metric: z.enum(METRIC),
  before: z.number().positive(),
  after: z.number().positive(),
  code_before: z.string().min(1).max(MAX_CODE),
  code_after: z.string().min(1).max(MAX_CODE),
  language: z.enum(LANGUAGE),
  body: z.string().max(5000).optional(),
  simd: z.enum(SIMD).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
  supersedes: z.string().optional(),
});

const gotchaSchema = z.object({
  type: z.literal("gotcha"),
  title: z.string().min(1).max(200),
  cpu: z.string().min(1),
  body: z.string().min(1).max(5000),
  code_before: z.string().max(MAX_CODE).optional(),
  code_after: z.string().max(MAX_CODE).optional(),
  simd: z.enum(SIMD).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
});

const snippetSchema = z.object({
  type: z.literal("snippet"),
  title: z.string().min(1).max(200),
  code_after: z.string().min(1).max(MAX_CODE),
  language: z.enum(LANGUAGE),
  body: z.string().max(5000).optional(),
  tags: z.array(z.string().max(30)).max(10).default([]),
  source_url: sourceUrl,
});

export const createSubmissionSchema = z.discriminatedUnion("type", [
  optimizationSchema,
  gotchaSchema,
  snippetSchema,
]);

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;

export const editSubmissionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().max(5000).nullable().optional(),
  before: z.number().positive().optional(),
  after: z.number().positive().optional(),
  metric: z.enum(METRIC).optional(),
  cpu: z.string().min(1).optional(),
  code_before: z.string().max(MAX_CODE).optional(),
  code_after: z.string().max(MAX_CODE).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
});

export type EditSubmissionInput = z.infer<typeof editSubmissionSchema>;
